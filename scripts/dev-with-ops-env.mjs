// Explicit opt-in for authenticated local acceptance; never prints credentials.
process.loadEnvFile('.env.ops.local');
process.env.NODE_ENV = 'development';
if (!process.env.TOKENPAY_ENCRYPTION_KEY || /redact/i.test(process.env.TOKENPAY_ENCRYPTION_KEY)) {
 console.warn('TokenPay encryption key is unavailable locally. Connected-account acceptance must run on the deployment; do not reset authorization.');
 delete process.env.TOKENPAY_ENCRYPTION_KEY;
}
process.argv = [process.argv[0], 'next', 'dev', '--webpack'];
await import('next/dist/bin/next');
