use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};

fn health_body() -> &'static str {
    r#"{"service":"backend-fast","status":"ok"}"#
}

fn handle_connection(mut stream: TcpStream) -> std::io::Result<()> {
    let mut buffer = [0; 512];
    let bytes_read = stream.read(&mut buffer)?;
    let request = String::from_utf8_lossy(&buffer[..bytes_read]);
    let (status, body) = if request.starts_with("GET /health ") {
        ("HTTP/1.1 200 OK", health_body())
    } else {
        ("HTTP/1.1 404 Not Found", r#"{"error":"not_found"}"#)
    };

    let response = format!(
        "{status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n{body}",
        body.len()
    );
    stream.write_all(response.as_bytes())
}

fn main() -> std::io::Result<()> {
    let bind_addr = std::env::var("LABORFLOW_FAST_BIND_ADDR")
        .unwrap_or_else(|_| "127.0.0.1:18081".to_string());
    let listener = TcpListener::bind(&bind_addr)?;
    println!("laborflow backend-fast listening on {bind_addr}");

    for stream in listener.incoming() {
        handle_connection(stream?)?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::health_body;

    #[test]
    fn health_body_contains_ok_status() {
        assert!(health_body().contains("\"status\":\"ok\""));
    }
}
