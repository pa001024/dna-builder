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

            // We have some jobs pending on the microtask queue. Try to poll the pending
            // tasks once to see if any of them finished, and run the pending microtasks
            // otherwise.
            if let Some(Err(err)) = future::poll_once(group.next()).await.flatten() {
                eprintln!("Uncaught {err}");
            };

            // Only one macrotask can be executed before the next drain of the microtask queue.
            self.drain_jobs(&mut context.borrow_mut());
            task::yield_now().await
        }
    }
}
