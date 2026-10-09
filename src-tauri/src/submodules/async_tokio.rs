use boa_engine::context::time::JsInstant;
use boa_engine::job::{GenericJob, TimeoutJob};
use boa_engine::{
    Context, JsResult,
    job::{Job, JobExecutor, NativeAsyncJob, PromiseJob},
};
use futures_concurrency::future::FutureGroup;
use futures_lite::{StreamExt, future};
use std::collections::BTreeMap;
use std::ops::DerefMut;
use std::{cell::RefCell, collections::VecDeque, rc::Rc};
use tokio::task;

#[cfg(target_os = "windows")]
unsafe extern "system" {
    unsafe fn timeBeginPeriod(uPeriod: u32) -> u32;
    unsafe fn timeEndPeriod(uPeriod: u32) -> u32;
}

/// 高精度定时器守卫：持有期间系统定时器粒度为 1ms，Drop 时恢复。
///
/// 执行器等待超时依赖 tokio sleep；默认约 15.6ms 粒度会给每次睡眠叠加约 8ms 误差，
/// 短睡眠按比例劣化严重。作用域限定在单次 run_jobs 内，进出自动配对，嵌套可重入。
struct HiResTimerGuard;

#[cfg(target_os = "windows")]
static HIRES_TIMER_REFS: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);

impl HiResTimerGuard {
    fn acquire() -> Self {
        #[cfg(target_os = "windows")]
        {
            use std::sync::atomic::Ordering;
            if HIRES_TIMER_REFS.fetch_add(1, Ordering::AcqRel) == 0 {
                unsafe { timeBeginPeriod(1) };
            }
        }
        Self
    }
}

impl Drop for HiResTimerGuard {
    fn drop(&mut self) {
        #[cfg(target_os = "windows")]
        {
            use std::sync::atomic::Ordering;
            if HIRES_TIMER_REFS.fetch_sub(1, Ordering::AcqRel) == 1 {
                unsafe { timeEndPeriod(1) };
            }
        }
    }
}
/// An event queue using tokio to drive futures to completion.
pub(crate) struct TokioJobExecutor {
    async_jobs: RefCell<VecDeque<NativeAsyncJob>>,
    promise_jobs: RefCell<VecDeque<PromiseJob>>,
    timeout_jobs: RefCell<BTreeMap<JsInstant, TimeoutJob>>,
    generic_jobs: RefCell<VecDeque<GenericJob>>,
}

impl TokioJobExecutor {
    pub fn new() -> Self {
        Self {
            async_jobs: RefCell::default(),
            promise_jobs: RefCell::default(),
            timeout_jobs: RefCell::default(),
            generic_jobs: RefCell::default(),
        }
    }

    fn drain_timeout_jobs(&self, context: &mut Context) {
        let now = context.clock().now();

        let mut timeouts_borrow = self.timeout_jobs.borrow_mut();
        let mut jobs_to_keep = timeouts_borrow.split_off(&now);
        jobs_to_keep.retain(|_, job| !job.is_cancelled());
        let jobs_to_run = std::mem::replace(timeouts_borrow.deref_mut(), jobs_to_keep);
        drop(timeouts_borrow);

        for job in jobs_to_run.into_values() {
            if let Err(e) = job.call(context) {
                eprintln!("Uncaught {e}");
            }
        }
    }

    fn drain_jobs(&self, context: &mut Context) {
        // Run the timeout jobs first.
        self.drain_timeout_jobs(context);

        let job = self.generic_jobs.borrow_mut().pop_front();
        if let Some(generic) = job
            && let Err(err) = generic.call(context)
        {
            eprintln!("Uncaught {err}");
        }

        let jobs = std::mem::take(&mut *self.promise_jobs.borrow_mut());
        for job in jobs {
            if let Err(e) = job.call(context) {
                eprintln!("Uncaught {e}");
            }
        }
        context.clear_kept_objects();
    }

    // pub(crate) fn is_empty(&self) -> bool {
    //     self.async_jobs.borrow().is_empty()
    //         && self.promise_jobs.borrow().is_empty()
    //         && self.timeout_jobs.borrow().is_empty()
    //         && self.generic_jobs.borrow().is_empty()
    // }
}

impl JobExecutor for TokioJobExecutor {
    fn enqueue_job(self: Rc<Self>, job: Job, context: &mut Context) {
        match job {
            Job::PromiseJob(job) => self.promise_jobs.borrow_mut().push_back(job),
            Job::AsyncJob(job) => self.async_jobs.borrow_mut().push_back(job),
            Job::TimeoutJob(t) => {
                let now = context.clock().now();
                self.timeout_jobs.borrow_mut().insert(now + t.timeout(), t);
            }
            Job::GenericJob(g) => self.generic_jobs.borrow_mut().push_back(g),
            _ => panic!("unsupported job type"),
        }
    }

    // While the sync flavor of `run_jobs` will block the current thread until all the jobs have finished...
    fn run_jobs(self: Rc<Self>, context: &mut Context) -> JsResult<()> {
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_time()
            .build()
            .unwrap();

        task::LocalSet::default().block_on(&runtime, self.run_jobs_async(&RefCell::new(context)))
    }

    // ...the async flavor won't, which allows concurrent execution with external async tasks.
    async fn run_jobs_async(self: Rc<Self>, context: &RefCell<&mut Context>) -> JsResult<()> {
        use crate::submodules::script::should_stop_current_script;
        use std::time::Duration;
        // 单次休眠上限：超时前无事可做时睡满该时长即醒，空转唤醒可忽略；
        // 同时保证停止请求最多延迟该时长生效。取 100 而非更小：
        // 常用节拍（100ms 睡眠/间隔）一次休眠即可覆盖，避免拆片引入多次定时器粒度误差。
        const MAX_PARK_MS: u64 = 100;
        // 脚本执行全程保持 1ms 定时器粒度，退出时自动恢复。
        let _hires_timer = HiResTimerGuard::acquire();
        let mut group = FutureGroup::new();
        loop {
            for job in std::mem::take(&mut *self.async_jobs.borrow_mut()) {
                group.insert(job.call(context));
            }

            if group.is_empty()
                && self.promise_jobs.borrow().is_empty()
                && self.timeout_jobs.borrow().is_empty()
                && self.generic_jobs.borrow().is_empty()
                || should_stop_current_script()
            {
                // All queues are empty. We can exit.
                return Ok(());
            }

            // 距下一个超时到期的剩余毫秒（无超时则取封顶值）。
            let now_ms = context.borrow().clock().now().millis_since_epoch();
            let wait_ms = self
                .timeout_jobs
                .borrow()
                .keys()
                .next()
                .map(|deadline| deadline.millis_since_epoch().saturating_sub(now_ms))
                .unwrap_or(MAX_PARK_MS)
                .min(MAX_PARK_MS);
            let has_micro =
                !self.promise_jobs.borrow().is_empty() || !self.generic_jobs.borrow().is_empty();

            if group.is_empty() && !has_micro {
                // 只有定时器 pending：休眠至最近到期点而非忙轮询；到期任务由下面的 drain 执行。
                if wait_ms > 0 {
                    tokio::time::sleep(Duration::from_millis(wait_ms)).await;
                }
            } else if !group.is_empty() && wait_ms > 0 {
                // 有在飞异步任务：等其完成或等到下一个超时，先到为准，保持原有执行顺序语义。
                if let Some(Err(err)) =
                    tokio::time::timeout(Duration::from_millis(wait_ms), group.next())
                        .await
                        .ok()
                        .flatten()
                {
                    eprintln!("Uncaught {err}");
                }
            } else if let Some(Err(err)) = future::poll_once(group.next()).await.flatten() {
                // 有在飞任务且超时已到期，或只有微任务：立即轮询一次（原逻辑）。
                eprintln!("Uncaught {err}");
            }

            // Only one macrotask can be executed before the next drain of the microtask queue.
            self.drain_jobs(&mut context.borrow_mut());
            task::yield_now().await
        }
    }
}
