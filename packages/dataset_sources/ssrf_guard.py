"""
SSRF (Server-Side Request Forgery) protection engine.
Enforces strict URI scheme allowlisting and denies loopback, private, link-local,
and cloud-provider metadata service addresses (e.g. AWS/GCP 169.254.169.254).
"""
import ipaddress
import socket
from urllib.parse import urlparse

from packages.dataset_core.exceptions import SSRFBlockedError

ALLOWED_SCHEMES = {"http", "https"}

DISALLOWED_HOSTS = {
    "localhost",
    "metadata.google.internal",
    "169.254.169.254",
    "instance-data",
}

BLOCKED_NETWORKS = [
    ipaddress.ip_network("0.0.0.0/8"),
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("169.254.0.0/16"),   # Link-local & cloud metadata
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("224.0.0.0/4"),     # Multicast
    ipaddress.ip_network("240.0.0.0/4"),     # Reserved
    ipaddress.ip_network("::1/128"),         # IPv6 loopback
    ipaddress.ip_network("fc00::/7"),        # IPv6 unique local
    ipaddress.ip_network("fe80::/10"),       # IPv6 link-local
]


def validate_url_safety(url: str) -> str:
    """
    Validates that a URL is safe for server-side outbound requests.
    Raises SSRFBlockedError if scheme or target address is unsafe.
    Returns the cleaned URL.
    """
    if not url or not isinstance(url, str):
        raise SSRFBlockedError(str(url), "Empty or non-string URL provided.")

    parsed = urlparse(url.strip())

    # 1. Scheme Validation
    if parsed.scheme.lower() not in ALLOWED_SCHEMES:
        raise SSRFBlockedError(
            url,
            f"Scheme '{parsed.scheme}' is not allowed. Only HTTP and HTTPS are permitted.",
        )

    hostname = parsed.hostname
    if not hostname:
        raise SSRFBlockedError(url, "URL missing valid hostname.")

    hostname_lower = hostname.lower()

    # 2. Denied Hostnames & Suffixes
    if hostname_lower in DISALLOWED_HOSTS:
        raise SSRFBlockedError(url, f"Hostname '{hostname}' is explicitly disallowed.")

    if hostname_lower.endswith((".local", ".internal", ".lan", ".home")):
        raise SSRFBlockedError(url, f"Internal domain suffix '{hostname}' is disallowed.")

    # 3. DNS Resolution and IP Address Filtering
    try:
        addr_info = socket.getaddrinfo(hostname, None)
    except socket.gaierror as e:
        raise SSRFBlockedError(url, f"Failed to resolve hostname '{hostname}': {e}") from e

    for family, _, _, _, sockaddr in addr_info:
        ip_str = sockaddr[0]
        try:
            ip_obj = ipaddress.ip_address(ip_str)
        except ValueError as e:
            raise SSRFBlockedError(url, f"Invalid IP address '{ip_str}' resolved.") from e

        # Built-in IP property checks
        if ip_obj.is_loopback:
            raise SSRFBlockedError(url, f"Resolved loopback address '{ip_str}'.")
        if ip_obj.is_private:
            raise SSRFBlockedError(url, f"Resolved private network address '{ip_str}'.")
        if ip_obj.is_link_local:
            raise SSRFBlockedError(url, f"Resolved link-local address '{ip_str}'.")
        if ip_obj.is_multicast:
            raise SSRFBlockedError(url, f"Resolved multicast address '{ip_str}'.")
        if ip_obj.is_reserved:
            raise SSRFBlockedError(url, f"Resolved reserved address '{ip_str}'.")

        # Explicit blocked CIDRs check
        for net in BLOCKED_NETWORKS:
            if ip_obj in net:
                raise SSRFBlockedError(
                    url,
                    f"Resolved IP address '{ip_str}' falls within blocked network range {net}.",
                )

    return url
