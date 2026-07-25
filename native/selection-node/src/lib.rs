use napi::bindgen_prelude::AsyncTask;
use napi::{Env, Result, Task};
use napi_derive::napi;

#[napi(ts_return_type = "Promise<string | null>")]
pub fn capture_selected_text() -> AsyncTask<CaptureSelectedTextTask> {
    AsyncTask::new(CaptureSelectedTextTask)
}

pub struct CaptureSelectedTextTask;

impl Task for CaptureSelectedTextTask {
    type Output = Option<String>;
    type JsValue = Option<String>;

    fn compute(&mut self) -> Result<Self::Output> {
        platform::capture_selected_text()
    }

    fn resolve(&mut self, _env: Env, output: Self::Output) -> Result<Self::JsValue> {
        Ok(output)
    }
}

#[cfg(target_os = "macos")]
mod platform {
    use std::ffi::{c_char, c_void};
    use std::ptr;

    use napi::{Error, Result};

    type AXUIElementRef = *const c_void;
    type CFStringRef = *const c_void;
    type CFTypeRef = *const c_void;
    type CFIndex = isize;
    type CFStringEncoding = u32;
    type CFTypeId = usize;
    type Boolean = u8;
    type AXError = i32;

    const K_AX_ERROR_SUCCESS: AXError = 0;
    const K_CF_STRING_ENCODING_UTF8: CFStringEncoding = 0x0800_0100;

    #[link(name = "ApplicationServices", kind = "framework")]
    unsafe extern "C" {
        fn AXUIElementCreateSystemWide() -> AXUIElementRef;
        fn AXUIElementCopyAttributeValue(
            element: AXUIElementRef,
            attribute: CFStringRef,
            value: *mut CFTypeRef,
        ) -> AXError;
    }

    #[link(name = "CoreFoundation", kind = "framework")]
    unsafe extern "C" {
        fn CFStringCreateWithCString(
            allocator: *const c_void,
            string: *const c_char,
            encoding: CFStringEncoding,
        ) -> CFStringRef;
        fn CFStringGetLength(string: CFStringRef) -> CFIndex;
        fn CFStringGetMaximumSizeForEncoding(
            length: CFIndex,
            encoding: CFStringEncoding,
        ) -> CFIndex;
        fn CFStringGetCString(
            string: CFStringRef,
            buffer: *mut c_char,
            buffer_size: CFIndex,
            encoding: CFStringEncoding,
        ) -> Boolean;
        fn CFStringGetTypeID() -> CFTypeId;
        fn CFGetTypeID(value: CFTypeRef) -> CFTypeId;
        fn CFRelease(value: CFTypeRef);
    }

    pub fn capture_selected_text() -> Result<Option<String>> {
        // SAFETY: Core Foundation objects returned from Create/Copy are released on every path,
        // and the selected value's type ID is checked before it is read as a CFString.
        unsafe {
            let system = AXUIElementCreateSystemWide();
            if system.is_null() {
                return Err(Error::from_reason("无法访问 macOS 辅助功能系统对象"));
            }

            let focused = copy_attribute(system, b"AXFocusedUIElement\0");
            CFRelease(system);
            let focused = focused?;
            let Some(focused) = focused else {
                return Ok(None);
            };

            let selected = copy_attribute(focused as AXUIElementRef, b"AXSelectedText\0");
            CFRelease(focused);
            let selected = selected?;
            let Some(selected) = selected else {
                return Ok(None);
            };

            if CFGetTypeID(selected) != CFStringGetTypeID() {
                CFRelease(selected);
                return Ok(None);
            }

            let text = cf_string_to_string(selected as CFStringRef);
            CFRelease(selected);
            let text = text?;
            let normalized = text.trim();
            Ok((!normalized.is_empty()).then(|| normalized.to_owned()))
        }
    }

    unsafe fn copy_attribute(
        element: AXUIElementRef,
        name: &'static [u8],
    ) -> Result<Option<CFTypeRef>> {
        let attribute = unsafe {
            CFStringCreateWithCString(ptr::null(), name.as_ptr().cast(), K_CF_STRING_ENCODING_UTF8)
        };
        if attribute.is_null() {
            return Err(Error::from_reason("无法创建辅助功能属性名称"));
        }

        let mut value: CFTypeRef = ptr::null();
        let status = unsafe { AXUIElementCopyAttributeValue(element, attribute, &mut value) };
        unsafe { CFRelease(attribute) };
        if status != K_AX_ERROR_SUCCESS || value.is_null() {
            return Ok(None);
        }
        Ok(Some(value))
    }

    unsafe fn cf_string_to_string(value: CFStringRef) -> Result<String> {
        let length = unsafe { CFStringGetLength(value) };
        let maximum =
            unsafe { CFStringGetMaximumSizeForEncoding(length, K_CF_STRING_ENCODING_UTF8) };
        if maximum < 0 {
            return Err(Error::from_reason("无法计算选中文本长度"));
        }

        let mut buffer = vec![0_u8; maximum as usize + 1];
        let copied = unsafe {
            CFStringGetCString(
                value,
                buffer.as_mut_ptr().cast(),
                buffer.len() as CFIndex,
                K_CF_STRING_ENCODING_UTF8,
            )
        };
        if copied == 0 {
            return Err(Error::from_reason("无法读取选中的 UTF-8 文本"));
        }

        let end = buffer
            .iter()
            .position(|byte| *byte == 0)
            .unwrap_or(buffer.len());
        String::from_utf8(buffer[..end].to_vec())
            .map_err(|_| Error::from_reason("选中的文本不是有效 UTF-8"))
    }
}

#[cfg(not(target_os = "macos"))]
mod platform {
    use napi::Result;

    pub fn capture_selected_text() -> Result<Option<String>> {
        Ok(None)
    }
}
