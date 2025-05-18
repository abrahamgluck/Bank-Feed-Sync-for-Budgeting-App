const express = require('express');
const axios = require('axios');
require('dotenv').config();

const app = express();

app.get('/test-token', async (req, res) => {
  try {
    const response = await axios.post('https://api.mastercard.com/open-banking-connect/v2/partners/authentication', null, {
      headers: {
        'Finicity-App-Key': process.env.FINICITY_APP_KEY,
        'Content-Type': 'application/json'
      },
      auth: {
        username: process.env.FINICITY_PARTNER_ID,
        password: process.env.FINICITY_PARTNER_SECRET
      }
    });

    console.log('✅ Token:', response.data);
    res.json(response.data);
  } catch (error) {
    console.error('❌ Token Error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to get token' });
  }
});

module.exports = app;
