require('dotenv').config();

const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_change_me';
const HISTORY_LIMIT = 100;
const SALT_ROUNDS = 10;
let mongoConnectionPromise = null;

// Enforce strict security settings in production
if (process.env.NODE_ENV === 'production') {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'fallback_secret_change_me') {
    throw new Error('CRITICAL SECURITY ERROR: JWT_SECRET environment variable must be set to a secure, unique string in a production environment.');
  }
}

// Enable Helmet for security headers (disable CSP to prevent font and icon blockages)
app.use(helmet({
  contentSecurityPolicy: false
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.static(__dirname));

const progressSnapshotSchema = new mongoose.Schema(
  {
    completedProblemIds: {
      type: [String],
      default: []
    },
    doneCount: {
      type: Number,
      required: true
    },
    updatedAt: {
      type: Date,
      default: Date.now
    }
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true
    },
    displayName: {
      type: String,
      required: true,
      trim: true
    },
    password: {
      type: String,
      required: false,
      default: null
    },
    completedProblemIds: {
      type: [String],
      default: []
    },
    history: {
      type: [progressSnapshotSchema],
      default: []
    },
    lastLoginAt: Date
  },
  { timestamps: true }
);

const User = mongoose.model('TrackerUser', userSchema, 'dsa_tracker_users');

function normalizeUsername(username) {
  return String(username || '').trim().toLowerCase();
}

function validateUsername(username) {
  if (!username) return 'Username is required.';
  if (username.length > 40) return 'Username must be 40 characters or fewer.';
  if (!/^[a-z0-9_-]+$/.test(username)) {
    return 'Use only letters, numbers, underscores, or hyphens.';
  }
  return '';
}

function validatePassword(password) {
  if (!password) return 'Password is required.';
  if (password.length < 6) return 'Password must be at least 6 characters.';
  if (password.length > 128) return 'Password must be 128 characters or fewer.';
  return '';
}

function cleanCompletedProblemIds(completedProblemIds) {
  if (!Array.isArray(completedProblemIds)) return [];
  return [...new Set(
    completedProblemIds
      .map(id => String(id || '').trim())
      .filter(Boolean)
  )];
}

function generateToken(user) {
  return jwt.sign(
    { userId: user._id, username: user.username },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}

async function connectMongo() {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  if (!MONGODB_URI) {
    throw new Error('MONGODB_URI is not set.');
  }

  if (!mongoConnectionPromise) {
    mongoConnectionPromise = mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 10000
    }).catch(error => {
      mongoConnectionPromise = null;
      throw error;
    });
  }

  await mongoConnectionPromise;
  return mongoose.connection;
}

async function requireMongo(req, res, next) {
  try {
    await connectMongo();
    next();
  } catch (error) {
    res.status(503).json({
      error: 'MongoDB is not connected. Check MONGODB_URI and MongoDB Atlas network access.',
      details: error.message
    });
  }
}

// JWT authentication middleware
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required. Please log in.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Session expired. Please log in again.' });
  }
}

app.get('/api/health', async (req, res) => {
  try {
    await connectMongo();
    res.json({ ok: true, mongoConnected: true });
  } catch (error) {
    res.json({
      ok: true,
      mongoConnected: false,
      reason: error.message
    });
  }
});

// Rate limiting for auth routes to prevent brute-force attacks
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // limit each IP to 20 auth requests per windowMs
  message: { error: 'Too many requests from this IP. Please try again after 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/register', authLimiter);
app.use('/api/login', authLimiter);
app.use('/api/migrate', authLimiter);

// ── REGISTER ──
app.post('/api/register', requireMongo, async (req, res, next) => {
  try {
    const displayName = String(req.body.username || '').trim();
    const username = normalizeUsername(displayName);
    const password = String(req.body.password || '');

    const usernameError = validateUsername(username);
    if (usernameError) {
      return res.status(400).json({ error: usernameError });
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      return res.status(400).json({ error: passwordError });
    }

    // Check if username already exists
    const existingUser = await User.findOne({ username }).lean();
    if (existingUser) {
      return res.status(409).json({ error: 'Username already taken. Try a different one.' });
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    const user = await User.create({
      username,
      displayName,
      password: hashedPassword,
      completedProblemIds: [],
      history: [],
      lastLoginAt: new Date()
    });

    const token = generateToken(user);

    res.status(201).json({
      token,
      username: user.username,
      displayName: user.displayName,
      completedProblemIds: user.completedProblemIds,
      doneCount: user.completedProblemIds.length
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ error: 'Username already taken. Try a different one.' });
    }
    next(error);
  }
});

// ── LOGIN ──
app.post('/api/login', requireMongo, async (req, res, next) => {
  try {
    const displayName = String(req.body.username || '').trim();
    const username = normalizeUsername(displayName);
    const password = String(req.body.password || '');

    const usernameError = validateUsername(username);
    if (usernameError) {
      return res.status(400).json({ error: usernameError });
    }

    const user = await User.findOne({ username });
    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    // Legacy user without password — prompt them to set one
    if (!user.password) {
      return res.status(409).json({
        error: 'This account was created before passwords were required. Please set a password.',
        needsMigration: true,
        username: user.username
      });
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      return res.status(400).json({ error: passwordError });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    // Update last login
    user.lastLoginAt = new Date();
    await user.save();

    const token = generateToken(user);

    res.json({
      token,
      username: user.username,
      displayName: user.displayName,
      completedProblemIds: user.completedProblemIds,
      doneCount: user.completedProblemIds.length
    });
  } catch (error) {
    next(error);
  }
});

// ── MIGRATE LEGACY USER (set password for accounts without one) ──
app.post('/api/migrate', requireMongo, async (req, res, next) => {
  try {
    const displayName = String(req.body.username || '').trim();
    const username = normalizeUsername(displayName);
    const password = String(req.body.password || '');

    const usernameError = validateUsername(username);
    if (usernameError) {
      return res.status(400).json({ error: usernameError });
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      return res.status(400).json({ error: passwordError });
    }

    const user = await User.findOne({ username });
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // Only allow migration for users without a password
    if (user.password) {
      return res.status(400).json({ error: 'This account already has a password. Please log in normally.' });
    }

    user.password = await bcrypt.hash(password, SALT_ROUNDS);
    user.lastLoginAt = new Date();
    await user.save();

    const token = generateToken(user);

    res.json({
      token,
      username: user.username,
      displayName: user.displayName,
      completedProblemIds: user.completedProblemIds,
      doneCount: user.completedProblemIds.length
    });
  } catch (error) {
    next(error);
  }
});

// ── VERIFY TOKEN (for auto-login on page refresh) ──
app.get('/api/me', requireMongo, requireAuth, async (req, res, next) => {
  try {
    const user = await User.findOne({ username: req.user.username }).lean();
    if (!user) {
      return res.status(401).json({ error: 'User not found.' });
    }

    res.json({
      username: user.username,
      displayName: user.displayName,
      completedProblemIds: user.completedProblemIds,
      doneCount: user.completedProblemIds.length
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/users/:username/progress', requireMongo, requireAuth, async (req, res, next) => {
  try {
    const username = normalizeUsername(req.params.username);
    const validationError = validateUsername(username);

    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    // Users can only access their own progress
    if (username !== req.user.username) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const user = await User.findOne({ username }).lean();
    if (!user) {
      return res.json({ username, completedProblemIds: [], history: [] });
    }

    res.json({
      username: user.username,
      displayName: user.displayName,
      completedProblemIds: user.completedProblemIds,
      doneCount: user.completedProblemIds.length,
      history: user.history
    });
  } catch (error) {
    next(error);
  }
});

app.put('/api/users/:username/progress', requireMongo, requireAuth, async (req, res, next) => {
  try {
    const username = normalizeUsername(req.params.username);
    const validationError = validateUsername(username);

    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    // Users can only update their own progress
    if (username !== req.user.username) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const completedProblemIds = cleanCompletedProblemIds(req.body.completedProblemIds);
    const snapshot = {
      completedProblemIds,
      doneCount: completedProblemIds.length,
      updatedAt: new Date()
    };

    const user = await User.findOneAndUpdate(
      { username },
      {
        $set: {
          completedProblemIds
        },
        $push: {
          history: {
            $each: [snapshot],
            $slice: -HISTORY_LIMIT
          }
        }
      },
      { new: true }
    ).lean();

    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    res.json({
      username: user.username,
      displayName: user.displayName,
      completedProblemIds: user.completedProblemIds,
      doneCount: user.completedProblemIds.length,
      historyCount: user.history.length
    });
  } catch (error) {
    next(error);
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.use((error, req, res, next) => {
  if (error.code === 11000) {
    return res.status(409).json({ error: 'That username is already being created. Try again.' });
  }

  console.error(error);
  res.status(500).json({ error: 'Server error. Please try again.' });
});

async function start() {
  app.listen(PORT, () => {
    console.log(`DSA tracker running at http://localhost:${PORT}`);
  });

  if (!MONGODB_URI) {
    console.warn('MONGODB_URI is missing. Add it to .env before logging in.');
    return;
  }

  connectMongo()
    .then(() => console.log('MongoDB connected'))
    .catch(error => console.error('MongoDB connection failed:', error.message));
}

if (process.env.VERCEL) {
  module.exports = app;
} else {
  start().catch(error => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
}
