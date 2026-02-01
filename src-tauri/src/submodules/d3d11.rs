use windows::Graphics::DirectX::Direct3D11::IDirect3DDevice;
use windows::Win32::Foundation::HMODULE;
use windows::Win32::Graphics::Direct3D::{
    D3D_DRIVER_TYPE_HARDWARE, D3D_FEATURE_LEVEL, D3D_FEATURE_LEVEL_9_1, D3D_FEATURE_LEVEL_9_2,
    D3D_FEATURE_LEVEL_9_3, D3D_FEATURE_LEVEL_10_0, D3D_FEATURE_LEVEL_10_1, D3D_FEATURE_LEVEL_11_0,
    D3D_FEATURE_LEVEL_11_1,
};
use windows::Win32::Graphics::Direct3D11::{
    D3D11_CREATE_DEVICE_BGRA_SUPPORT, D3D11_SDK_VERSION, D3D11CreateDevice, ID3D11Device,
    ID3D11DeviceContext,
};
use windows::Win32::Graphics::Dxgi::IDXGIDevice;
use windows::Win32::System::WinRT::Direct3D11::CreateDirect3D11DeviceFromDXGIDevice;
use windows::core::Interface;

#[derive(thiserror::Error, Eq, PartialEq, Clone, Debug)]
/// Errors that can occur when creating or working with Direct3D devices and textures.
pub enum Error {
    /// The created device does not support at least feature level 11.0.
    #[error("Failed to create DirectX device with the recommended feature levels")]
    FeatureLevelNotSatisfied,
    /// A Windows Runtime/Win32 API call failed.
    ///
    /// Wraps [`windows::core::Error`].
    #[error("Windows API Error: {0}")]
    WindowsError(#[from] windows::core::Error),
}

/// Creates an [`windows::Win32::Graphics::Direct3D11::ID3D11Device`] and an
/// [`windows::Win32::Graphics::Direct3D11::ID3D11DeviceContext`].
///
/// # Errors
///
/// - [`Error::WindowsError`] when the underlying `D3D11CreateDevice` call fails
/// - [`Error::FeatureLevelNotSatisfied`] when the created device does not support at least feature
///   level 11.0
#[inline]
pub fn create_d3d_device() -> Result<(ID3D11Device, ID3D11DeviceContext), Error> {
    // Array of Direct3D feature levels.
    // The feature levels are listed in descending order of capability.
    // The highest feature level supported by the system is at index 0.
    // The lowest feature level supported by the system is at the last index.
    let feature_flags = [
        D3D_FEATURE_LEVEL_11_1,
        D3D_FEATURE_LEVEL_11_0,
        D3D_FEATURE_LEVEL_10_1,
        D3D_FEATURE_LEVEL_10_0,
        D3D_FEATURE_LEVEL_9_3,
        D3D_FEATURE_LEVEL_9_2,
        D3D_FEATURE_LEVEL_9_1,
    ];

    let mut d3d_device = None;
    let mut feature_level = D3D_FEATURE_LEVEL::default();
    let mut d3d_device_context = None;
    unsafe {
        D3D11CreateDevice(
            None,
            D3D_DRIVER_TYPE_HARDWARE,
            HMODULE::default(),
            D3D11_CREATE_DEVICE_BGRA_SUPPORT,
            Some(&feature_flags),
            D3D11_SDK_VERSION,
            Some(&mut d3d_device),
            Some(&mut feature_level),
            Some(&mut d3d_device_context),
        )?;
    };

    if feature_level.0 < D3D_FEATURE_LEVEL_11_0.0 {
        return Err(Error::FeatureLevelNotSatisfied);
    }

    Ok((d3d_device.unwrap(), d3d_device_context.unwrap()))
}

/// Creates an [`windows::Graphics::DirectX::Direct3D11::IDirect3DDevice`] from an
/// [`windows::Win32::Graphics::Direct3D11::ID3D11Device`].
///
/// # Errors
///
/// - [`Error::WindowsError`] when creating the Direct3D11 device wrapper fails
#[inline]
pub fn create_direct3d_device(d3d_device: &ID3D11Device) -> Result<IDirect3DDevice, Error> {
    let dxgi_device: IDXGIDevice = d3d_device.cast()?;
    let inspectable = unsafe { CreateDirect3D11DeviceFromDXGIDevice(&dxgi_device)? };
    let device: IDirect3DDevice = inspectable.cast()?;

    Ok(device)
}
