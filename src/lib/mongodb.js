const { MongoClient } = require('mongodb');
try {
  require('dotenv').config();
} catch (e) {
  // Ignore error if dotenv is not available (production)
}

let cachedClient = null;
let cachedDb = null;

async function getDb() {
  const uri = process.env.MONGODB_URI;
  
  if (!uri) {
    console.error('Error: MONGODB_URI is not defined');
    throw new Error('Please add your Mongo URI to environment variables');
  }

  if (cachedClient && cachedDb) {
    try {
      if (!cachedClient.topology || !cachedClient.topology.isConnected()) {
        console.log('Topology closed, resetting cache');
        try { await cachedClient.close(); } catch {}
        cachedClient = null;
        cachedDb = null;
      } else {
        return cachedDb;
      }
    } catch {
      return cachedDb;
    }
  }

  if (!cachedClient) {
    cachedClient = new MongoClient(uri, {
      maxPoolSize: 10,
      minPoolSize: 2,
      maxIdleTimeMS: 30000,
      serverSelectionTimeoutMS: 15000,
      connectTimeoutMS: 15000,
      heartbeatFrequencyMS: 10000,
      socketTimeoutMS: 45000,
      compressors: ['zlib'],
      retryWrites: true,
      retryReads: true,
    });
  }

  try {
    await cachedClient.connect();
  } catch (err) {
    console.error('MongoDB connect failed, resetting cache:', err.message);
    try { await cachedClient.close(); } catch {}
    cachedClient = null;
    cachedDb = null;
    throw err;
  }

  cachedDb = cachedClient.db();
  return cachedDb;
}

// Função para fechar a conexão (útil em ambientes serverless)
async function closeClient() {
  if (cachedClient) {
    await cachedClient.close();
    cachedClient = null;
    cachedDb = null;
  }
}

module.exports = { getDb, closeClient };
