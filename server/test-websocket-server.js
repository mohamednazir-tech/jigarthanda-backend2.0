// Test WebSocket server functionality
console.log('🔌 Testing WebSocket server setup...');

// Check if required modules are available
try {
  const { createServer } = require('http');
  const { Server } = require('socket.io');
  console.log('✅ WebSocket modules loaded successfully');
  
  // Test basic server creation
  const httpServer = createServer();
  const io = new Server(httpServer, {
    cors: { origin: "*" }
  });
  
  console.log('✅ WebSocket server created successfully');
  console.log('🚀 Ready for real-time updates!');
  
} catch (error) {
  console.error('❌ WebSocket setup error:', error);
  console.log('💡 Make sure socket.io is installed: npm install socket.io');
}
