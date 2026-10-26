// Orca log on MongoDB. Each document is an Orca object in APInt utility form:
// { index, alias, content, properties: { tags, metadata: { author, time } } }

const { MongoClient } = require('mongodb');
const { config } = require('./config');

const THREAD_TAG = 'orca-thread';
const NOTE_TAG = 'orca-note';

let client;
let col;
let counters;

async function connect() {
  client = new MongoClient(config.mongoUri);
  await client.connect();
  const db = client.db(config.mongoDb);
  col = db.collection(config.logName);
  counters = db.collection('orca-counters');
  await col.createIndex({ index: 1 }, { unique: true });
  await col.createIndex({ 'properties.tags': 1, index: 1 });
}

async function close() {
  if (client) await client.close();
}

async function nextIndex() {
  const doc = await counters.findOneAndUpdate(
    { _id: config.logName },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after' }
  );
  return doc.seq;
}

// Appends an orca-note. Visible notes also carry the orca-thread tag.
async function appendNote({ author, content, visible }) {
  const index = await nextIndex();
  const obj = {
    index,
    alias: String(index),
    content,
    properties: {
      tags: visible ? [NOTE_TAG, THREAD_TAG] : [NOTE_TAG],
      metadata: { author, time: Date.now() },
    },
  };
  await col.insertOne(obj);
  return obj;
}

// Most recent n objects, oldest first.
async function tail(n) {
  const docs = await col.find({}).sort({ index: -1 }).limit(n).toArray();
  return docs.reverse();
}

async function latestIndex() {
  const d = await col.find({}, { projection: { index: 1 } }).sort({ index: -1 }).limit(1).toArray();
  return d.length ? d[0].index : 0;
}

// Thread-visible objects with index > after, oldest first.
async function threadAfter(after, limit = 200) {
  return col
    .find({ 'properties.tags': THREAD_TAG, index: { $gt: after } })
    .sort({ index: 1 })
    .limit(limit)
    .toArray();
}

const isVisible = (o) => (o.properties?.tags || []).includes(THREAD_TAG);

module.exports = { connect, close, appendNote, tail, latestIndex, threadAfter, isVisible, THREAD_TAG };
