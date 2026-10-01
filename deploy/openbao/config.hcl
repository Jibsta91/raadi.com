# OpenBao server — single node, integrated (raft) storage.
# TLS terminates at Traefik; OpenBao is only reachable on the internal network.
ui            = true
disable_mlock = true
api_addr      = "http://openbao:8200"
cluster_addr  = "http://openbao:8201"
log_format    = "json"

storage "raft" {
  path    = "/openbao/file"
  node_id = "openbao-1"
}

listener "tcp" {
  address     = "0.0.0.0:8200"
  tls_disable = true
  telemetry {
    unauthenticated_metrics_access = true
  }
}

telemetry {
  prometheus_retention_time = "30s"
  disable_hostname          = true
}

audit "file" "stdout" {
  options {
    file_path = "stdout"
  }
}
