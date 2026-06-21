const { MongoClient } = require('mongodb');

const client = new MongoClient(process.env.MONGO_URI);

let db = null;

const connectDB = async () => {
  try {
    if (!db) {
      await client.connect();
      db = client.db('bloodDonationDB');
      console.log('DB connected');
    }
    return db;
  } catch (error) {
    console.error('DB connection error:', error);
    throw error;
  }
};

module.exports = connectDB;