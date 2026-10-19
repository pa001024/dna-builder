//! 开发期插桩计时（`--features prof`）：作用域内含时间 + 调用次数。

#[cfg(feature = "prof")]
mod imp {
    use std::cell::RefCell;
    use std::collections::HashMap;
    use std::time::Instant;

    thread_local! {
        static TABLE: RefCell<HashMap<&'static str, (u64, u128, u128)>> = RefCell::new(HashMap::new());
        static STACK: RefCell<Vec<u128>> = const { RefCell::new(Vec::new()) };
    }

    pub struct Guard(&'static str, Instant);

    impl Drop for Guard {
        fn drop(&mut self) {
            let elapsed = self.1.elapsed().as_nanos();
            let child = STACK.with(|stack| {
                let mut stack = stack.borrow_mut();
                let child = stack.pop().unwrap_or(0);
                if let Some(parent) = stack.last_mut() {
                    *parent += elapsed;
                }
                child
            });
            TABLE.with(|table| {
                let mut table = table.borrow_mut();
                let entry = table.entry(self.0).or_insert((0, 0, 0));
                entry.0 += 1;
                entry.1 += elapsed;
                entry.2 += elapsed.saturating_sub(child);
            });
        }
    }

    pub fn enter(name: &'static str) -> Guard {
        STACK.with(|stack| stack.borrow_mut().push(0));
        Guard(name, Instant::now())
    }

    pub fn report() -> String {
        TABLE.with(|table| {
            let mut rows: Vec<_> = table.borrow().iter().map(|(k, v)| (*k, *v)).collect();
            rows.sort_by(|a, b| b.1.2.cmp(&a.1.2));
            let mut out = String::new();
            for (name, (count, nanos, own)) in rows {
                out.push_str(&format!(
                    "{name:<44} calls={count:<8} self={:>7.2}ms total={:>7.2}ms avg={:.2}µs
",
                    own as f64 / 1e6,
                    nanos as f64 / 1e6,
                    nanos as f64 / count.max(1) as f64 / 1e3
                ));
            }
            out
        })
    }

    pub fn reset() {
        TABLE.with(|table| table.borrow_mut().clear());
    }
}

#[cfg(feature = "prof")]
pub use imp::{report, reset};

#[cfg(not(feature = "prof"))]
pub fn report() -> String {
    String::new()
}

#[cfg(not(feature = "prof"))]
pub fn reset() {}

#[cfg(feature = "prof")]
#[macro_export]
macro_rules! prof {
    ($name:expr) => {
        let _prof_guard = $crate::prof::imp_enter($name);
    };
}

#[cfg(not(feature = "prof"))]
#[macro_export]
macro_rules! prof {
    ($name:expr) => {};
}

#[cfg(feature = "prof")]
pub fn imp_enter(name: &'static str) -> imp::Guard {
    imp::enter(name)
}
