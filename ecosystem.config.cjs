module.exports = {
  apps: [
    {
      name: "chessview-api",
      script: "src/server.js",
      cwd: "/home/chessview-api/htdocs/api.chessview.org",
      interpreter: "/opt/chessview/runtimes/node/24/bin/node",
      instances: 1,
      exec_mode: "fork",
      wait_ready: true,
      listen_timeout: 30000,
      kill_timeout: 10000,
      max_memory_restart: "512M",
      time: true,
      env: {
        NODE_ENV: "production",
        HOST: "127.0.0.1",
        PORT: "4000"
      }
    }
  ]
};
