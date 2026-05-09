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
    const { message, history } = req.body;
    if (!message) return res.status(400).json({ error: 'Message is required' });

    // Step 1: Ask Gemini what data it needs to answer this question
    const classifyPrompt = `
You are a data classifier for a Shopify store assistant. 
Given this user question, determine which Shopify data sources are needed to answer it.
Output a valid JSON array containing only the needed sources from this list: ["orders", "products", "customers", "inventory"].
Only include what is truly necessary. For general chat or greetings, return [].

Question: "${message}"
JSON Array:`;

    let neededData = [];
    if (process.env.GEMINI_API_KEY) {
      const classifyResult = await model.generateContent(classifyPrompt);
      const classifyText = classifyResult.response.text();
      const arrayMatch = classifyText.match(/\[[\s\S]*?\]/);
      if (arrayMatch) neededData = JSON.parse(arrayMatch[0]);
    }

    // Step 2: Fetch all required data from Shopify in parallel
    const dataContext = {};

    if (process.env.SHOPIFY_STORE_URL && process.env.SHOPIFY_ACCESS_TOKEN) {
      const fetches = [];

      if (neededData.includes('orders')) {
        fetches.push(
          axios.get(`${SHOPIFY_BASE_URL}/orders.json?status=any&limit=250&fields=id,created_at,total_price,line_items,customer`, {
            headers: getShopifyHeaders()
          }).then(r => { dataContext.orders = r.data.orders; })
          .catch(() => { dataContext.orders = []; })
        );
      }

      if (neededData.includes('products')) {
        fetches.push(
          axios.get(`${SHOPIFY_BASE_URL}/products.json?fields=id,title,product_type,status,variants&limit=250`, {
            headers: getShopifyHeaders()
          }).then(r => { dataContext.products = r.data.products; })
          .catch(() => { dataContext.products = []; })
        );
      }

      if (neededData.includes('customers')) {
        fetches.push(
          axios.get(`${SHOPIFY_BASE_URL}/customers.json?limit=250&fields=id,first_name,last_name,email,orders_count,total_spent,last_order_id`, {
            headers: getShopifyHeaders()
          }).then(r => { dataContext.customers = r.data.customers; })
          .catch(() => { dataContext.customers = []; })
        );
      }

      if (neededData.includes('inventory')) {
        fetches.push(
          axios.get(`${SHOPIFY_BASE_URL}/products.json?fields=id,title,variants&limit=250`, {
            headers: getShopifyHeaders()
          }).then(r => { dataContext.inventory = r.data.products; })
          .catch(() => { dataContext.inventory = []; })
        );
      }

      await Promise.all(fetches);
    }

    // Step 3: Build final prompt with all the data and ask Gemini for a real answer
    const dataSection = Object.keys(dataContext).length > 0
      ? `\n\nHere is the live Shopify store data to help you answer:\n${JSON.stringify(dataContext, null, 2)}`
      : '';

    const conversationHistory = (history || []).map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.text}`).join('\n');

    const finalPrompt = `
You are a friendly and concise AI Business Analyst for "Storybook Cakes Australia", a small cake mix business.
Answer the user's question using the provided Shopify data. Be helpful, warm, and format your answer clearly.
Use bullet points or numbered lists where appropriate. Keep answers concise but insightful.
If no store data was provided, answer from general business knowledge and be honest that you don't have access to live data for that question.${dataSection}

${conversationHistory ? `Previous conversation:\n${conversationHistory}\n` : ''}
User: ${message}
Assistant:`;

    let answer = "I'm sorry, I couldn't generate a response. Please check your Gemini API key.";
    if (process.env.GEMINI_API_KEY) {
      const finalResult = await model.generateContent(finalPrompt);
      answer = finalResult.response.text();
    }

    res.json({ answer });
  } catch (error) {
    console.error('Error in /api/chat:', error);
    res.status(500).json({ error: 'Failed to get a response from the AI Analyst.' });
  }
});

app.listen(port, () => {
  console.log(`AI Content Editor backend running on port ${port}`);
});
