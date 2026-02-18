use boa_engine::property::Attribute;
use boa_engine::{
    Context, JsArgs, JsData, JsResult, JsString, JsSymbol, JsValue, js_str, js_string,
    native_function::NativeFunction,
    object::{JsObject, ObjectInitializer},
    property::PropertyKey,
    value::{JsVariant, Numeric},
};
use boa_gc::{Finalize, Trace};
use std::{
    cell::RefCell,
    collections::{HashMap, HashSet, hash_map::Entry},
    fmt::Write as _,
    rc::Rc,
    time::SystemTime,
};

/// 控制台输出后端接口。
pub trait Logger: Trace {
    /// `console.trace` 默认实现：先输出主消息，再输出堆栈名。
    fn trace(&self, msg: String, state: &ConsoleState, context: &mut Context) -> JsResult<()> {
        self.log(msg, state, context)?;
        let stack_trace_dump = context
            .stack_trace()
            .map(|frame| frame.code_block().name())
            .map(JsString::to_std_string_escaped)
            .collect::<Vec<_>>();
        for frame in stack_trace_dump {
            self.log(frame, state, context)?;
        }
        Ok(())
    }

    /// `console.debug` 默认复用 `log`。
    fn debug(&self, msg: String, state: &ConsoleState, context: &mut Context) -> JsResult<()> {
        self.log(msg, state, context)
    }

    /// `console.log`
    fn log(&self, msg: String, state: &ConsoleState, context: &mut Context) -> JsResult<()>;
    /// `console.info`
    fn info(&self, msg: String, state: &ConsoleState, context: &mut Context) -> JsResult<()>;
    /// `console.warn`
    fn warn(&self, msg: String, state: &ConsoleState, context: &mut Context) -> JsResult<()>;
    /// `console.error`
    fn error(&self, msg: String, state: &ConsoleState, context: &mut Context) -> JsResult<()>;
}

/// 控制台状态。
#[derive(Debug, Default, Trace, Finalize)]
pub struct ConsoleState {
    /// `console.count` 计数。
    count_map: HashMap<JsString, u32>,
    /// `console.time/timeLog/timeEnd` 计时。
    timer_map: HashMap<JsString, u128>,
    /// 分组栈。
    groups: Vec<String>,
}

impl ConsoleState {
    /// 当前缩进宽度（每层 2 空格）。
    #[allow(dead_code)]
    #[must_use]
    pub fn indent(&self) -> usize {
        2 * self.groups.len()
    }

    /// 当前分组栈。
    #[allow(dead_code)]
    #[must_use]
    pub fn groups(&self) -> &Vec<String> {
        &self.groups
    }

    /// 计数映射。
    #[allow(dead_code)]
    #[must_use]
    pub fn count_map(&self) -> &HashMap<JsString, u32> {
        &self.count_map
    }

    /// 计时映射。
    #[allow(dead_code)]
    #[must_use]
    pub fn timer_map(&self) -> &HashMap<JsString, u128> {
        &self.timer_map
    }
}

/// 控制台对象内部状态。
#[derive(Debug, Default, Trace, Finalize, JsData)]
pub struct Console {
    state: ConsoleState,
}

/// 将值转为控制台输出字符串。
///
/// 关键改造：
/// - 只遍历对象自有属性，不输出原型链；
/// - 数组展开元素，避免 `Array(1)` 这种摘要输出；
/// - 处理循环引用，输出 `[Cycle]`。
fn value_to_console_string(value: &JsValue, context: &mut Context) -> JsResult<String> {
    fn format_js_value(
        value: &JsValue,
        context: &mut Context,
        seen: &mut HashSet<usize>,
        depth: usize,
    ) -> JsResult<String> {
        if let JsVariant::String(text) = value.variant() {
            return Ok(text.to_std_string_escaped());
        }
        let Some(obj) = value.as_object() else {
            return Ok(value.display().to_string());
        };

        let addr = std::ptr::from_ref(obj.as_ref()).addr();
        if seen.contains(&addr) {
            return Ok("[Cycle]".to_string());
        }
        if depth >= 8 {
            return Ok("[Object]".to_string());
        }
        seen.insert(addr);

        let result = if obj.is_array() {
            let len = obj
                .get(js_string!("length"), context)?
                .to_length(context)?
                .min(200) as u32;
            let mut items = Vec::<String>::with_capacity(len as usize);
            for i in 0..len {
                if obj.has_own_property(i, context)? {
                    let item = obj.get(i, context)?;
                    items.push(format_js_value(&item, context, seen, depth + 1)?);
                } else {
                    items.push("<empty>".to_string());
                }
            }
            format!("[ {} ]", items.join(", "))
        } else {
            let keys = obj.own_property_keys(context)?;
            let mut pairs = Vec::<String>::with_capacity(keys.len());
            for key in keys {
                let value = obj.get(key.clone(), context)?;
                let key_text = match key {
                    PropertyKey::String(ref s) => s.to_std_string_escaped(),
                    PropertyKey::Index(i) => i.get().to_string(),
                    PropertyKey::Symbol(s) => s.descriptive_string().to_std_string_escaped(),
                };
                let value_text = format_js_value(&value, context, seen, depth + 1)?;
                pairs.push(format!("{key_text}: {value_text}"));
            }
            format!("{{ {} }}", pairs.join(", "))
        };

        seen.remove(&addr);
        Ok(result)
    }

    if let JsVariant::String(text) = value.variant() {
        return Ok(text.to_std_string_escaped());
    }
    let mut seen = HashSet::<usize>::new();
    format_js_value(value, context, &mut seen, 0)
}

/// 控制台格式化器（基于 boa_runtime 实现改造）。
fn formatter(data: &[JsValue], context: &mut Context) -> JsResult<String> {
    match data {
        [] => Ok(String::new()),
        [val] => Ok(value_to_console_string(val, context)?),
        data => {
            if !data[0].is_string() {
                let mut merged = String::new();
                for (idx, value) in data.iter().enumerate() {
                    if idx > 0 {
                        merged.push(' ');
                    }
                    merged.push_str(&value_to_console_string(value, context)?);
                }
                return Ok(merged);
            }

            let mut formatted = String::new();
            let mut arg_index = 1;
            let target = data
                .get_or_undefined(0)
                .to_string(context)?
                .to_std_string_escaped();
            let mut chars = target.chars();

            while let Some(c) = chars.next() {
                if c == '%' {
                    let fmt = chars.next().unwrap_or('%');
                    match fmt {
                        'd' | 'i' => {
                            let arg = match data.get_or_undefined(arg_index).to_numeric(context)? {
                                Numeric::Number(r) => (r.floor() + 0.0).to_string(),
                                Numeric::BigInt(int) => int.to_string(),
                            };
                            formatted.push_str(&arg);
                            arg_index += 1;
                        }
                        'f' => {
                            let arg = data.get_or_undefined(arg_index).to_number(context)?;
                            let _ = write!(formatted, "{arg:.6}");
                            arg_index += 1;
                        }
                        // 对象占位符：强制深度展示。
                        'o' | 'O' => {
                            let arg = data.get_or_undefined(arg_index);
                            formatted.push_str(&value_to_console_string(arg, context)?);
                            arg_index += 1;
                        }
                        's' => {
                            let arg = data.get_or_undefined(arg_index);
                            let mut written = false;
                            if let Some(obj) = arg.as_object()
                                && let Ok(to_string) = obj.get(js_string!("toString"), context)
                                && let Some(to_string_fn) = to_string.as_function()
                            {
                                let arg = to_string_fn.call(arg, &[], context)?.to_string(context)?;
                                formatted.push_str(&arg.to_std_string_escaped());
                                written = true;
                            }
                            if !written {
                                let arg = arg.to_string(context)?.to_std_string_escaped();
                                formatted.push_str(&arg);
                            }
                            arg_index += 1;
                        }
                        '%' => formatted.push('%'),
                        unknown => {
                            formatted.push('%');
                            formatted.push(unknown);
                        }
                    }
                } else {
                    formatted.push(c);
                }
            }

            for rest in data.iter().skip(arg_index) {
                formatted.push(' ');
                formatted.push_str(&value_to_console_string(rest, context)?);
            }
            Ok(formatted)
        }
    }
}

impl Console {
    /// 全局 `console` 名称。
    pub const NAME: JsString = js_string!("console");

    /// 注册 `console` 到全局对象。
    pub fn register_with_logger<L>(logger: L, context: &mut Context) -> JsResult<()>
    where
        L: Logger + 'static,
    {
        let console = Self::init_with_logger(logger, context);
        context.register_global_property(
            Self::NAME,
            console,
            Attribute::WRITABLE | Attribute::CONFIGURABLE,
        )?;
        Ok(())
    }

    /// 初始化带自定义 logger 的 `console` 对象。
    #[allow(clippy::too_many_lines)]
    pub fn init_with_logger<L>(logger: L, context: &mut Context) -> JsObject
    where
        L: Logger + 'static,
    {
        fn console_method<L: Logger + 'static>(
            f: fn(&JsValue, &[JsValue], &Console, &L, &mut Context) -> JsResult<JsValue>,
            state: Rc<RefCell<Console>>,
            logger: Rc<L>,
        ) -> NativeFunction {
            // SAFETY: Console 不包含 GC 需要追踪的额外引用。
            unsafe {
                NativeFunction::from_closure(move |this, args, context| {
                    f(this, args, &state.borrow(), &logger, context)
                })
            }
        }

        fn console_method_mut<L: Logger + 'static>(
            f: fn(&JsValue, &[JsValue], &mut Console, &L, &mut Context) -> JsResult<JsValue>,
            state: Rc<RefCell<Console>>,
            logger: Rc<L>,
        ) -> NativeFunction {
            // SAFETY: Console 不包含 GC 需要追踪的额外引用。
            unsafe {
                NativeFunction::from_closure(move |this, args, context| {
                    f(this, args, &mut state.borrow_mut(), &logger, context)
                })
            }
        }

        let state = Rc::new(RefCell::new(Self::default()));
        let logger = Rc::new(logger);

        ObjectInitializer::with_native_data_and_proto(
            Self::default(),
            JsObject::with_object_proto(context.realm().intrinsics()),
            context,
        )
        .property(
            JsSymbol::to_string_tag(),
            Self::NAME,
            Attribute::CONFIGURABLE,
        )
        .function(
            console_method(Self::assert, state.clone(), logger.clone()),
            js_string!("assert"),
            0,
        )
        .function(
            console_method_mut(Self::clear, state.clone(), logger.clone()),
            js_string!("clear"),
            0,
        )
        .function(
            console_method(Self::debug, state.clone(), logger.clone()),
            js_string!("debug"),
            0,
        )
        .function(
            console_method(Self::error, state.clone(), logger.clone()),
            js_string!("error"),
            0,
        )
        .function(
            console_method(Self::info, state.clone(), logger.clone()),
            js_string!("info"),
            0,
        )
        .function(
            console_method(Self::log, state.clone(), logger.clone()),
            js_string!("log"),
            0,
        )
        .function(
            console_method(Self::trace, state.clone(), logger.clone()),
            js_string!("trace"),
            0,
        )
        .function(
            console_method(Self::warn, state.clone(), logger.clone()),
            js_string!("warn"),
            0,
        )
        .function(
            console_method_mut(Self::count, state.clone(), logger.clone()),
            js_string!("count"),
            0,
        )
        .function(
            console_method_mut(Self::count_reset, state.clone(), logger.clone()),
            js_string!("countReset"),
            0,
        )
        .function(
            console_method_mut(Self::group, state.clone(), logger.clone()),
            js_string!("group"),
            0,
        )
        .function(
            console_method_mut(Self::group_collapsed, state.clone(), logger.clone()),
            js_string!("groupCollapsed"),
            0,
        )
        .function(
            console_method_mut(Self::group_end, state.clone(), logger.clone()),
            js_string!("groupEnd"),
            0,
        )
        .function(
            console_method_mut(Self::time, state.clone(), logger.clone()),
            js_string!("time"),
            0,
        )
        .function(
            console_method(Self::time_log, state.clone(), logger.clone()),
            js_string!("timeLog"),
            0,
        )
        .function(
            console_method_mut(Self::time_end, state.clone(), logger.clone()),
            js_string!("timeEnd"),
            0,
        )
        .function(
            console_method(Self::dir, state.clone(), logger.clone()),
            js_string!("dir"),
            0,
        )
        .function(
            console_method(Self::dir, state, logger),
            js_string!("dirxml"),
            0,
        )
        .build()
    }

    /// `console.assert(condition, ...data)`
    fn assert(
        _: &JsValue,
        args: &[JsValue],
        console: &Self,
        logger: &impl Logger,
        context: &mut Context,
    ) -> JsResult<JsValue> {
        let assertion = args.first().is_some_and(JsValue::to_boolean);
        if !assertion {
            let mut args: Vec<JsValue> = args.iter().skip(1).cloned().collect();
            let message = js_string!("Assertion failed");
            if args.is_empty() {
                args.push(JsValue::new(message));
            } else if !args[0].is_string() {
                args.insert(0, JsValue::new(message));
            } else {
                let value = JsString::from(args[0].display().to_string());
                let concat = js_string!(message.as_str(), js_str!(": "), &value);
                args[0] = JsValue::new(concat);
            }
            logger.error(formatter(&args, context)?, &console.state, context)?;
        }
        Ok(JsValue::undefined())
    }

    /// `console.clear()`
    #[allow(clippy::unnecessary_wraps)]
    fn clear(
        _: &JsValue,
        _: &[JsValue],
        console: &mut Self,
        _: &impl Logger,
        _: &mut Context,
    ) -> JsResult<JsValue> {
        console.state.groups.clear();
        Ok(JsValue::undefined())
    }

    /// `console.debug(...data)`
    fn debug(
        _: &JsValue,
        args: &[JsValue],
        console: &Self,
        logger: &impl Logger,
        context: &mut Context,
    ) -> JsResult<JsValue> {
        logger.debug(formatter(args, context)?, &console.state, context)?;
        Ok(JsValue::undefined())
    }

    /// `console.error(...data)`
    fn error(
        _: &JsValue,
        args: &[JsValue],
        console: &Self,
        logger: &impl Logger,
        context: &mut Context,
    ) -> JsResult<JsValue> {
        logger.error(formatter(args, context)?, &console.state, context)?;
        Ok(JsValue::undefined())
    }

    /// `console.info(...data)`
    fn info(
        _: &JsValue,
        args: &[JsValue],
        console: &Self,
        logger: &impl Logger,
        context: &mut Context,
    ) -> JsResult<JsValue> {
        logger.info(formatter(args, context)?, &console.state, context)?;
        Ok(JsValue::undefined())
    }

    /// `console.log(...data)`
    fn log(
        _: &JsValue,
        args: &[JsValue],
        console: &Self,
        logger: &impl Logger,
        context: &mut Context,
    ) -> JsResult<JsValue> {
        logger.log(formatter(args, context)?, &console.state, context)?;
        Ok(JsValue::undefined())
    }

    /// `console.trace(...data)`
    fn trace(
        _: &JsValue,
        args: &[JsValue],
        console: &Self,
        logger: &impl Logger,
        context: &mut Context,
    ) -> JsResult<JsValue> {
        Logger::trace(logger, formatter(args, context)?, &console.state, context)?;
        Ok(JsValue::undefined())
    }

    /// `console.warn(...data)`
    fn warn(
        _: &JsValue,
        args: &[JsValue],
        console: &Self,
        logger: &impl Logger,
        context: &mut Context,
    ) -> JsResult<JsValue> {
        logger.warn(formatter(args, context)?, &console.state, context)?;
        Ok(JsValue::undefined())
    }

    /// `console.count(label)`
    fn count(
        _: &JsValue,
        args: &[JsValue],
        console: &mut Self,
        logger: &impl Logger,
        context: &mut Context,
    ) -> JsResult<JsValue> {
        let label = match args.first() {
            Some(value) => value.to_string(context)?,
            None => "default".into(),
        };

        let msg = format!("count {}:", label.to_std_string_escaped());
        let c = console.state.count_map.entry(label).or_insert(0);
        *c += 1;
        logger.info(format!("{msg} {c}"), &console.state, context)?;
        Ok(JsValue::undefined())
    }

    /// `console.countReset(label)`
    fn count_reset(
        _: &JsValue,
        args: &[JsValue],
        console: &mut Self,
        logger: &impl Logger,
        context: &mut Context,
    ) -> JsResult<JsValue> {
        let label = match args.first() {
            Some(value) => value.to_string(context)?,
            None => "default".into(),
        };
        console.state.count_map.remove(&label);
        logger.warn(
            format!("countReset {}", label.to_std_string_escaped()),
            &console.state,
            context,
        )?;
        Ok(JsValue::undefined())
    }

    /// 格式化耗时毫秒数，保留小数精度并移除无意义尾零。
    fn format_elapsed_ms(elapsed_ms: f64) -> String {
        let mut text = format!("{elapsed_ms:.12}");
        while text.ends_with('0') {
            let _ = text.pop();
        }
        if text.ends_with('.') {
            text.push('0');
        }
        text
    }

    /// 当前系统纳秒时间戳（Unix Epoch）。
    fn system_time_in_ns() -> u128 {
        let now = SystemTime::now();
        now.duration_since(SystemTime::UNIX_EPOCH)
            .expect("negative duration")
            .as_nanos()
    }

    /// `console.time(label)`
    fn time(
        _: &JsValue,
        args: &[JsValue],
        console: &mut Self,
        logger: &impl Logger,
        context: &mut Context,
    ) -> JsResult<JsValue> {
        let label = match args.first() {
            Some(value) => value.to_string(context)?,
            None => "default".into(),
        };

        if let Entry::Vacant(entry) = console.state.timer_map.entry(label.clone()) {
            entry.insert(Self::system_time_in_ns());
        } else {
            logger.warn(
                format!("Timer '{}' already exist", label.to_std_string_escaped()),
                &console.state,
                context,
            )?;
        }
        Ok(JsValue::undefined())
    }

    /// `console.timeLog(label, ...data)`
    fn time_log(
        _: &JsValue,
        args: &[JsValue],
        console: &Self,
        logger: &impl Logger,
        context: &mut Context,
    ) -> JsResult<JsValue> {
        let label = match args.first() {
            Some(value) => value.to_string(context)?,
            None => "default".into(),
        };

        if let Some(started) = console.state.timer_map.get(&label) {
            let now_ns = Self::system_time_in_ns();
            let elapsed_ms = now_ns.saturating_sub(*started) as f64 / 1_000_000.0;
            let mut concat = format!(
                "{}: {} ms",
                label.to_std_string_escaped(),
                Self::format_elapsed_ms(elapsed_ms)
            );
            for msg in args.iter().skip(1) {
                concat.push(' ');
                concat.push_str(&value_to_console_string(msg, context)?);
            }
            logger.log(concat, &console.state, context)?;
        } else {
            logger.warn(
                format!("Timer '{}' doesn't exist", label.to_std_string_escaped()),
                &console.state,
                context,
            )?;
        }

        Ok(JsValue::undefined())
    }

    /// `console.timeEnd(label)`。
    ///
    /// 关键改造：输出里移除 `- timer removed` 后缀。
    fn time_end(
        _: &JsValue,
        args: &[JsValue],
        console: &mut Self,
        logger: &impl Logger,
        context: &mut Context,
    ) -> JsResult<JsValue> {
        let label = match args.first() {
            Some(value) => value.to_string(context)?,
            None => "default".into(),
        };

        if let Some(started) = console.state.timer_map.remove(&label) {
            let now_ns = Self::system_time_in_ns();
            let elapsed_ms = now_ns.saturating_sub(started) as f64 / 1_000_000.0;
            logger.info(
                format!(
                    "{}: {} ms",
                    label.to_std_string_escaped(),
                    Self::format_elapsed_ms(elapsed_ms)
                ),
                &console.state,
                context,
            )?;
        } else {
            logger.warn(
                format!("Timer '{}' doesn't exist", label.to_std_string_escaped()),
                &console.state,
                context,
            )?;
        }
        Ok(JsValue::undefined())
    }

    /// `console.group(...data)`
    fn group(
        _: &JsValue,
        args: &[JsValue],
        console: &mut Self,
        logger: &impl Logger,
        context: &mut Context,
    ) -> JsResult<JsValue> {
        let group_label = formatter(args, context)?;
        logger.info(format!("group: {group_label}"), &console.state, context)?;
        console.state.groups.push(group_label);
        Ok(JsValue::undefined())
    }

    /// `console.groupCollapsed(...data)`。
    fn group_collapsed(
        _: &JsValue,
        args: &[JsValue],
        console: &mut Self,
        logger: &impl Logger,
        context: &mut Context,
    ) -> JsResult<JsValue> {
        Self::group(&JsValue::undefined(), args, console, logger, context)
    }

    /// `console.groupEnd()`
    #[allow(clippy::unnecessary_wraps)]
    fn group_end(
        _: &JsValue,
        _: &[JsValue],
        console: &mut Self,
        _: &impl Logger,
        _: &mut Context,
    ) -> JsResult<JsValue> {
        console.state.groups.pop();
        Ok(JsValue::undefined())
    }

    /// `console.dir(item, options)`
    #[allow(clippy::unnecessary_wraps)]
    fn dir(
        _: &JsValue,
        args: &[JsValue],
        console: &Self,
        logger: &impl Logger,
        context: &mut Context,
    ) -> JsResult<JsValue> {
        logger.info(value_to_console_string(args.get_or_undefined(0), context)?, &console.state, context)?;
        Ok(JsValue::undefined())
    }
}
