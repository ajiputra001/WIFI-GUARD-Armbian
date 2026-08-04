module.exports = {
  apps: [
    {
      name: 'wifi-guard',
      script: 'src/index.js',
      cwd: __dirname,
      autorestart: true,
      watch: false,
      max_memory_restart: '700M',
      env: {
        NODE_ENV: 'production',
      },
      error_file: '/root/.pm2/logs/wifi-guard-error.log',
      out_file: '/root/.pm2/logs/wifi-guard-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      kill_timeout: 5000,
    },
  ],
};
