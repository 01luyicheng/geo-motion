module.exports = {
  apps: [{
    name: 'geo-motion',
    script: 'npm',
    args: 'start',
    cwd: '/root/geo-motion/frontend',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    }
  }]
}
