const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const cors = require('cors');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Share io instance
app.set('io', io);

const PORT = process.env.PORT || 3000;

// MongoDB Connection
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/btech_results';

mongoose.connect(MONGO_URI)
  .then(async () => {
    console.log('✅ MongoDB Connected Successfully');
    // Auto-create default admin
    const Admin = require('./models/Admin');
    const adminCount = await Admin.countDocuments();
    if (adminCount === 0) {
      await Admin.create({ 
        username: 'admin', 
        password: process.env.ADMIN_PASSWORD || 'admin123', 
        name: 'Super Admin',
        email: 'admin@college.edu'
      });
      console.log('👤 Admin account ready');
    }
  })
  .catch(err => console.error('❌ MongoDB Connection Error:', err));

// Middleware
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Session Configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'btech_result_secret_key_2024',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: MONGO_URI }),
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

// Routes
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const resultsRoutes = require('./routes/results');
const chatRoutes = require('./routes/chat');

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/results', resultsRoutes);
app.use('/api/chat', chatRoutes);

// Serve frontend pages
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// Student Portal Aliases
const serveStudent = (req, res) => res.sendFile(path.join(__dirname, 'public', 'student.html'));
app.get('/student', serveStudent);
app.get('/user', serveStudent);
app.get('/pages/user', serveStudent);

// Admin Portal Aliases
const serveAdmin = (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html'));
app.get('/admin', serveAdmin);
app.get('/pages/admin', serveAdmin);

// Socket.io Connection Logic
io.on('connection', (socket) => {
  console.log('📡 New Real-Time Connection:', socket.id);
  
  // Join specific rooms for targeted updates
  socket.on('join', (room) => {
    socket.join(room);
    console.log(`👤 User joined room: ${room}`);
  });

  socket.on('disconnect', () => {
    console.log('🔌 Disconnected');
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
  console.log(`📚 B.Tech Result Portal is LIVE!`);
});
