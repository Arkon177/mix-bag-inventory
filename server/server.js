require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Initialize Gemini API
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || 'dummy_key_to_prevent_crash_if_missing');
const model = genAI.getGenerativeModel({ model: 'gemini-flash-latest' });

// Setup Shopify API Headers
const getShopifyHeaders = () => ({
  'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
  'Content-Type': 'application/json',
});

const SHOPIFY_BASE_URL = `https://${process.env.SHOPIFY_STORE_URL}/admin/api/2023-10`;

// 1. The Interpretation Stage (Backend -> Gemini)
app.post('/api/interpret', async (req, res) => {
  try {
    const { message } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    if (!process.env.GEMINI_API_KEY) {
       // Return dummy response for testing without keys
       return res.json({
         intent: message.toLowerCase().includes('ingredient') ? 'update_ingredients' : 'update_nutrition',
         raw_instructions: message
       });
    }

    const prompt = `
You are an Intent Router for a Shopify store content editor. 
Analyze the following user input and extract the intent and raw instructions.
The output MUST be a valid JSON object matching this exact structure:
{
  "intent": "update_ingredients" or "update_nutrition" (or "other" if not applicable),
  "raw_instructions": "the rest of the input regarding what to change"
}

User input: "${message}"
JSON:`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    
    // Clean up potential markdown formatting from Gemini response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Could not parse JSON from Gemini response");
    }
    
    const parsedData = JSON.parse(jsonMatch[0]);
    res.json(parsedData);
  } catch (error) {
    console.error('Error in /api/interpret:', error);
    res.status(500).json({ error: 'Failed to interpret message' });
  }
});

// 1.5 Fetch all products for the dropdown
app.get('/api/shopify/products', async (req, res) => {
  try {
    if (!process.env.SHOPIFY_STORE_URL || !process.env.SHOPIFY_ACCESS_TOKEN) {
        return res.json({
            products: [
                { id: 'dummy_1', title: 'Strawberry Jam' },
                { id: 'dummy_2', title: 'Organic Coffee Beans' }
            ]
        });
    }

    const response = await axios.get(`${SHOPIFY_BASE_URL}/products.json?fields=id,title,product_type&limit=250`, {
      headers: getShopifyHeaders()
    });

    res.json({ products: response.data.products || [] });
  } catch (error) {
    console.error('Error in /api/shopify/products:', error);
    res.status(500).json({ error: 'Failed to retrieve products list from Shopify' });
  }
});

// 2. The Retrieval Stage (Backend -> Shopify)
app.get('/api/shopify/product', async (req, res) => {
  try {
    const { id } = req.query;
    
    if (!id) {
      return res.status(400).json({ error: 'Product ID is required' });
    }

    if (!process.env.SHOPIFY_STORE_URL || !process.env.SHOPIFY_ACCESS_TOKEN) {
        // Return dummy data for now so the UI can be tested without real Shopify keys
        return res.json({
            id: id,
            title: 'Dummy Product',
            body_html: '<p>This is the original description for Dummy Product.</p>'
        });
    }

    // Call Shopify API to search for product by ID
    const response = await axios.get(`${SHOPIFY_BASE_URL}/products/${id}.json`, {
      headers: getShopifyHeaders()
    });

    const product = response.data.product;
    
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json({
      id: product.id,
      title: product.title,
      body_html: product.body_html || ''
    });
  } catch (error) {
    console.error('Error in /api/shopify/product:', error);
    res.status(500).json({ error: 'Failed to retrieve product from Shopify' });
  }
});

// 3. The Draft & Preview Stage (Backend -> Gemini)
app.post('/api/draft', async (req, res) => {
  try {
    const { body_html, raw_instructions, intent } = req.body;

    if (!process.env.GEMINI_API_KEY) {
        return res.json({
            draft_html: body_html + `<br/><br/><p><b>Draft generated for:</b> ${intent}</p>`
        });
    }

    const prompt = `
You are an expert Shopify content writer. Your task is to rewrite or append to the provided HTML body based on the instructions.
CRUCIAL INSTRUCTION: You MUST output clean, valid HTML. DO NOT wrap the output in markdown code blocks (e.g. \`\`\`html). Just output the raw HTML.

- If the intent is "update_ingredients", format the ingredients as an HTML unordered list (<ul><li>).
- If the intent is "update_nutrition", format the nutrition as a standard HTML table styled to look like a nutritional panel.
- Maintain any other existing HTML content unless the instructions imply replacing it.

Intent: ${intent}
Instructions: ${raw_instructions}

Current HTML:
${body_html || '(Empty)'}

New Valid HTML Output:`;

    const result = await model.generateContent(prompt);
    let newHtml = result.response.text();
    
    // Remove potential markdown code block formatting
    if (newHtml.startsWith('\`\`\`html')) {
        newHtml = newHtml.replace(/^\`\`\`html\n/, '').replace(/\n\`\`\`$/, '');
    } else if (newHtml.startsWith('\`\`\`')) {
        newHtml = newHtml.replace(/^\`\`\`\n/, '').replace(/\n\`\`\`$/, '');
    }

    res.json({ draft_html: newHtml.trim() });
  } catch (error) {
    console.error('Error in /api/draft:', error);
    res.status(500).json({ error: 'Failed to generate draft' });
  }
});

// 4. The Finalization Stage (Backend -> Shopify)
app.put('/api/shopify/update', async (req, res) => {
  try {
    const { id, body_html } = req.body;

    if (!id || !body_html) {
      return res.status(400).json({ error: 'Product ID and new HTML are required' });
    }

    if (!process.env.SHOPIFY_STORE_URL || !process.env.SHOPIFY_ACCESS_TOKEN) {
        // Return dummy success if Shopify keys aren't set yet
        return res.json({ success: true, message: 'Dummy update successful (No Shopify keys set)' });
    }

    const payload = {
      product: {
        id: id,
        body_html: body_html
      }
    };

    const response = await axios.put(`${SHOPIFY_BASE_URL}/products/${id}.json`, payload, {
      headers: getShopifyHeaders()
    });

    res.json({ success: true, message: 'Successfully updated product in Shopify', product: response.data.product });
  } catch (error) {
    console.error('Error in /api/shopify/update:', error);
    res.status(500).json({ error: 'Failed to update product in Shopify' });
  }
});

// 5. AI Business Analyst Chat
app.post('/api/chat', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'Message is required' });

    console.log('Analyst processing question:', message);

    const dataContext = {
      summary: { total_orders: 0, total_revenue: 0, top_products: {} },
      targeted_data: null
    };

    if (process.env.SHOPIFY_STORE_URL && process.env.SHOPIFY_ACCESS_TOKEN) {
      // 1. Get products list to match names
      const prodRes = await axios.get(`${SHOPIFY_BASE_URL}/products.json?limit=250&fields=id,title`, {
        headers: getShopifyHeaders()
      });
      const products = prodRes.data.products || [];

      // 2. See if the user is asking about a specific product OR CATEGORY
      const matchPrompt = `Which products from this list are related to this question: "${message}"? Output ONLY a comma-separated list of IDs, or "none". \n\nOptions:\n${products.map(p => `${p.title}: ${p.id}`).join('\n')}`;
      let matchedIds = [];
      try {
        const matchResult = await model.generateContent(matchPrompt);
        const matchText = matchResult.response.text().trim();
        if (matchText !== 'none') {
            matchedIds = matchText.split(',').map(id => id.trim()).filter(id => id.match(/^\d+$/));
        }
      } catch (e) { console.error('Product matching failed'); }

      // 3. If matched, fetch ALL orders for ALL those products
      if (matchedIds.length > 0) {
        console.log('Targeted scan for product IDs:', matchedIds);
        
        // We'll fetch orders for the first 5 matched products to keep it fast
        const fetches = matchedIds.slice(0, 5).map(id => 
            axios.get(`${SHOPIFY_BASE_URL}/orders.json?status=any&limit=250&product_id=${id}&fields=line_items`, {
                headers: getShopifyHeaders(),
                timeout: 10000
            }).catch(() => ({ data: { orders: [] } }))
        );

        const results = await Promise.all(fetches);
        const allTargetedOrders = results.flatMap(r => r.data.orders || []);
        
        // Fix: De-duplicate orders by ID so we don't double-count
        const uniqueOrders = Array.from(new Map(allTargetedOrders.map(o => [o.id, o])).values());
        
        const stats = {};
        uniqueOrders.forEach(o => {
          o.line_items?.forEach(item => {
            if (item.product_id && matchedIds.includes(item.product_id.toString())) {
                const name = item.title;
                stats[name] = (stats[name] || 0) + (item.quantity || 0);
            }
          });
        });

        dataContext.targeted_data = stats;
        // Skip general scan if we have targeted stats
        return respondWithData(dataContext, message, res);
      }

      // 4. General Scan (only if no targeted match)
      if (!global.analystCache) global.analystCache = { data: null, lastFetched: 0 };
      const now = Date.now();
      if (global.analystCache.data && (now - global.analystCache.lastFetched < 15 * 60 * 1000)) {
        dataContext.summary = global.analystCache.data.summary;
      } else {
        console.log('Cache empty. Scanning last 500 orders...');
        let orders = [];
        let nextUrl = `${SHOPIFY_BASE_URL}/orders.json?status=any&limit=250&fields=total_price,line_items`;
        
        // Only 2 pages (500 orders) to stay within Render memory limits
        for (let i = 0; i < 2; i++) {
          const r = await axios.get(nextUrl, { 
            headers: getShopifyHeaders(),
            timeout: 15000 
          });
          orders = orders.concat(r.data.orders || []);
          const link = r.headers['link'];
          if (link && link.includes('rel="next"')) {
            const match = link.match(/<(.*?)>;\s*rel="next"/);
            if (match) nextUrl = match[1]; else break;
          } else break;
        }

        orders.forEach(o => {
          dataContext.summary.total_orders++;
          dataContext.summary.total_revenue += parseFloat(o.total_price || 0);
          o.line_items?.forEach(item => {
            if (item.title) {
              dataContext.summary.top_products[item.title] = (dataContext.summary.top_products[item.title] || 0) + (item.quantity || 0);
            }
          });
        });
        global.analystCache = { data: dataContext, lastFetched: now };
      }
    }

    return respondWithData(dataContext, message, res);
  } catch (error) {
    console.error('ERROR:', error);
    res.status(500).json({ error: `Analyst Error: ${error.message}` });
  }
});

// Helper to send final prompt to Gemini
async function respondWithData(dataContext, message, res) {
  const finalPrompt = `
You are a expert Business Analyst for Storybook Cakes Australia.
Analyze the store data and answer the question.
Data: ${JSON.stringify(dataContext)}
Question: ${message}
Answer:`;

  if (process.env.GEMINI_API_KEY) {
    try {
      const result = await model.generateContent(finalPrompt);
      res.json({ answer: result.response.text() });
    } catch (e) {
      console.error('Gemini call failed:', e.message);
      res.json({ answer: "I'm sorry, I've hit my daily limit for AI questions. Please try again tomorrow or upgrade your Gemini API key in AI Studio!" });
    }
  } else {
    res.json({ answer: "Gemini API key missing." });
  }
}

app.listen(port, () => {
  console.log(`AI Content Editor backend running on port ${port}`);
});
