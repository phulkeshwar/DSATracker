require('dotenv').config();

const path = require('path');
const express = require('express');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;
const HISTORY_LIMIT = 100;
let mongoConnectionPromise = null;

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

function cleanCompletedProblemIds(completedProblemIds) {
  if (!Array.isArray(completedProblemIds)) return [];
  return [...new Set(
    completedProblemIds
      .map(id => String(id || '').trim())
      .filter(Boolean)
  )];
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

app.post('/api/login', requireMongo, async (req, res, next) => {
  try {
    const displayName = String(req.body.username || '').trim();
    const username = normalizeUsername(displayName);
    const validationError = validateUsername(username);

    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    let user = await User.findOneAndUpdate(
      { username },
      {
        $set: {
          displayName,
          lastLoginAt: new Date()
        }
      },
      { new: true }
    ).lean();

    if (!user) {
      try {
        user = await User.create({
          username,
          displayName,
          completedProblemIds: [],
          history: [],
          lastLoginAt: new Date()
        });
        user = user.toObject();
      } catch (error) {
        if (error.code !== 11000) throw error;
        user = await User.findOneAndUpdate(
          { username },
          {
            $set: {
              displayName,
              lastLoginAt: new Date()
            }
          },
          { new: true }
        ).lean();
      }
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

app.get('/api/users/:username/progress', requireMongo, async (req, res, next) => {
  try {
    const username = normalizeUsername(req.params.username);
    const validationError = validateUsername(username);

    if (validationError) {
      return res.status(400).json({ error: validationError });
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

app.put('/api/users/:username/progress', requireMongo, async (req, res, next) => {
  try {
    const username = normalizeUsername(req.params.username);
    const validationError = validateUsername(username);

    if (validationError) {
      return res.status(400).json({ error: validationError });
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
          displayName: req.params.username,
          completedProblemIds
        },
        $push: {
          history: {
            $each: [snapshot],
            $slice: -HISTORY_LIMIT
          }
        }
      },
      { new: true, upsert: true }
    ).lean();

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
