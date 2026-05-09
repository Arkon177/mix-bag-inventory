require('dotenv').config();
const express = require('express');
const axios = require('axios');
const app = express();
const port = 3001; 

const CLIENT_ID = process.env.SHOPIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET;
const SHOP = process.env.SHOPIFY_STORE_URL;
const REDIRECT_URI = `http://localhost:${port}/callback`;

app.get('/login', (req, res) => {
  if (!CLIENT_ID || !CLIENT_SECRET || !SHOP) {
    return res.send('Please set SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET, and SHOPIFY_STORE_URL in your .env file.');
  }
  const scopes = 'read_products,write_products';
  // Use a random nonce state for security
  const state = Math.random().toString(36).substring(7);
  const installUrl = `https://${SHOP}/admin/oauth/authorize?client_id=${CLIENT_ID}&scope=${scopes}&redirect_uri=${REDIRECT_URI}&state=${state}`;
  res.redirect(installUrl);
});

app.get('/callback', async (req, res) => {
  const { code, shop } = req.query;
  if (!code) {
    return res.send('No code returned from Shopify');
  }

  try {
    const response = await axios.post(`https://${shop}/admin/oauth/access_token`, {
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code
    });

    const accessToken = response.data.access_token;
    console.log('\n=============================================');
    console.log('🎉 SUCCESS! YOUR ADMIN API ACCESS TOKEN IS:');
    console.log('\n   ' + accessToken + '   \n');
    console.log('=============================================\n');
    console.log('You can now copy this token, paste it into your Render environment variables as SHOPIFY_ACCESS_TOKEN, and close this terminal window (Ctrl+C).');
    
    res.send(`<h1>Success!</h1><p>Your access token has been printed in your Terminal. You can now close this browser window and head back to the terminal.</p>`);
  } catch (error) {
    console.error('Error exchanging token:', error.response ? error.response.data : error.message);
    res.send('Error exchanging token. Check terminal for details.');
  }
});

app.listen(port, () => {
  console.log(`\n🤖 OAuth Helper running!`);
  console.log(`To get your token, Cmd+Click this link: http://localhost:${port}/login\n`);
});
