use serde::{Serialize, de::DeserializeOwned};
use sha2::{Digest, Sha256};
use std::{
    fmt::Write as _,
    fs,
    io::{ErrorKind, Write},
    path::Path,
};

pub fn read(path: &Path) -> Result<Option<String>, String> {
    match fs::read_to_string(path) {
        Ok(content) => Ok(Some(content)),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

pub fn load<T: Default + DeserializeOwned>(path: &Path) -> Result<T, String> {
    match read(path)? {
        Some(data) => serde_json::from_str(&data).map_err(|error| error.to_string()),
        None => Ok(T::default()),
    }
}

pub fn save(path: &Path, value: &impl Serialize) -> Result<(), String> {
    let mut data = serde_json::to_string_pretty(value).map_err(|error| error.to_string())?;
    data.push('\n');
    atomic_write(path, &data)
}

pub fn atomic_write(path: &Path, content: &str) -> Result<(), String> {
    let parent = path.parent().ok_or("Invalid file path")?;
    let mut file = tempfile::NamedTempFile::new_in(parent).map_err(|error| error.to_string())?;
    if let Ok(metadata) = fs::metadata(path) {
        file.as_file()
            .set_permissions(metadata.permissions())
            .map_err(|error| error.to_string())?;
    }
    file.write_all(content.as_bytes())
        .and_then(|()| file.as_file().sync_all())
        .map_err(|error| error.to_string())?;
    file.persist(path).map_err(|error| error.to_string())?;
    Ok(())
}

pub fn fingerprint(value: &serde_json::Value) -> String {
    let digest = Sha256::digest(value.to_string());
    let mut fingerprint = String::with_capacity(digest.len() * 2);
    for byte in digest {
        write!(fingerprint, "{byte:02x}").expect("writing to a String cannot fail");
    }
    fingerprint
}
