require('dotenv').config();

const express = require('express');
const { Pool } = require('pg');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.connect()
  .then(() => console.log('Connected to Postgres!'))
  .catch(err => console.error('Postgres connection error:', err));

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
  console.error('Supabase URL or ANON KEY missing in .env!');
  process.exit(1); 
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

console.log('Supabase auth initialized');

app.get('/', (req, res) => {
  res.send('🚀 Backend is live!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

module.exports = { app, pool, supabase };
