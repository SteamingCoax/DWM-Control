// Quick test to check SerialPort bindings loading
console.log('Node.js version:', process.version);
console.log('Process platform:', process.platform);
console.log('Process arch:', process.arch);
console.log('Process versions:', JSON.stringify(process.versions, null, 2));

try {
  const { SerialPort } = require('serialport');
  console.log('SerialPort loaded successfully');
  console.log('SerialPort binding path:', require.resolve('@serialport/bindings-cpp'));
} catch (error) {
  console.error('SerialPort loading failed:', error.message);
  console.error('Full error:', error);
}
