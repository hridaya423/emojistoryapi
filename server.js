const express = require("express");
const axios = require("axios");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;
app.use(express.json());
app.use(require("cors")());

let storyHistory = [];
let totalStoriesGenerated = 0;

const generateStory = async (prompt, genre = "general", length = "medium") => {
  try {
    let enhancedPrompt = prompt;
    if (genre !== "general") {
      enhancedPrompt += ` Make it a ${genre} story.`;
    } 
    if (length === "short") {
      enhancedPrompt += " Keep it very brief, around 3-4 sentences.";
    } else if (length === "long") {
      enhancedPrompt += " Make it more detailed, with about 3-4 paragraphs.";
    }
    enhancedPrompt += " IMPORTANT: Do NOT include any <think> tags or similar markers in your response. Provide ONLY the final story in plain text.";

    const response = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "deepseek-r1-distill-llama-70b",
        messages: [{ role: "user", content: enhancedPrompt }],
        max_tokens: length === "long" ? 1600 : (length === "short" ? 600 : 950),
        temperature: 0.7,
      },
      {
        headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      }
    );
    let storyText = response.data.choices[0].message.content;
    storyText = storyText.replace(/<think>[\s\S]*?<\/think>/g, "");
    storyText = storyText.trim();
    
    return storyText;
  } catch (error) {
    console.error("Groq API Error:", error.response?.data || error.message);
    return "Error generating story. Please try again later.";
  }
};

const emojiToPrompt = (emojis) => {
  return `Create a short, interesting story based on these emojis: ${emojis.join(" ")}`;
};

const generateStoryId = () => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
};

app.get("/health", (req, res) => {
  res.json({ 
    status: "ok", 
    uptime: process.uptime(),
    version: "1.0.0"
  });
});

app.get("/stats", (req, res) => {
  const emojiCounts = {};
  storyHistory.forEach(story => {
    story.emojis.forEach(emoji => {
      emojiCounts[emoji] = (emojiCounts[emoji] || 0) + 1;
    });
  });
  
  const topEmojis = Object.entries(emojiCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([emoji, count]) => ({ emoji, count }));
  
  res.json({ 
    totalStoriesGenerated,
    storiesInHistory: storyHistory.length,
    topEmojis
  });
});

app.get("/history", (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const startIndex = (page - 1) * limit;
  const endIndex = page * limit;
  
  const results = {
    stories: storyHistory.slice(startIndex, endIndex),
    pagination: {
      total: storyHistory.length,
      pages: Math.ceil(storyHistory.length / limit),
      currentPage: page
    }
  };
  
  res.json(results);
});

app.post("/generate", async (req, res) => {
  const { emojis, genre = "general", length = "medium" } = req.body;
  
  if (!emojis || !Array.isArray(emojis) || emojis.length === 0) {
    return res.status(400).json({ error: "Please provide an array of emojis" });
  }

  const validGenres = ["general", "comedy", "romance", "horror", "fantasy", "sci-fi", "mystery"];
  if (genre && !validGenres.includes(genre)) {
    return res.status(400).json({ error: "Invalid genre. Available genres: " + validGenres.join(", ") });
  }
  
  const validLengths = ["short", "medium", "long"];
  if (length && !validLengths.includes(length)) {
    return res.status(400).json({ error: "Invalid length. Available options: " + validLengths.join(", ") });
  }

  try {
    const prompt = emojiToPrompt(emojis);
    const story = await generateStory(prompt, genre, length);
    const timestamp = new Date().toISOString();
    const storyId = generateStoryId();
    const storyEntry = { 
      id: storyId,
      emojis, 
      story, 
      genre, 
      length,
      timestamp,
      likes: 0
    };
    
    storyHistory.push(storyEntry);
    totalStoriesGenerated++;

    res.json({ 
      id: storyId,
      story,
      emojis,
      genre,
      length,
      timestamp
    });
  } catch (error) {
    console.error("Error generating story:", error);
    res.status(500).json({ error: "Failed to generate story" });
  }
});

app.get("/story/:id", (req, res) => {
  const story = storyHistory.find(s => s.id === req.params.id);
  
  if (!story) {
    return res.status(404).json({ error: "Story not found" });
  }
  
  res.json(story);
});

app.post("/story/:id/like", (req, res) => {
  const storyIndex = storyHistory.findIndex(s => s.id === req.params.id);
  
  if (storyIndex === -1) {
    return res.status(404).json({ error: "Story not found" });
  }
  
  storyHistory[storyIndex].likes = (storyHistory[storyIndex].likes || 0) + 1;
  
  res.json({ likes: storyHistory[storyIndex].likes });
});

app.get("/random", (req, res) => {
  if (storyHistory.length === 0) {
    return res.status(404).json({ error: "No stories available at the moment" });
  }

  const randomIndex = Math.floor(Math.random() * storyHistory.length);
  const randomStory = storyHistory[randomIndex];
  
  res.json(randomStory);
});

app.post("/random-emoji-story", async (req, res) => {
  const { count = 3, genre = "general", length = "medium" } = req.body;
  
  const emojiPool = [
    "😀", "😂", "😍", "🥳", "😎", "🤔", "😱", "😴", "🚀", "🌈", 
    "🔥", "💧", "🌊", "🌍", "🌙", "☀️", "⭐", "🍕", "🍦", "🎂", 
    "🎁", "🎮", "📱", "💻", "⚽", "🏆", "🎯", "🎭", "🎨", "🚗"
  ];
  
  const randomEmojis = [];
  for (let i = 0; i < Math.min(count, 5); i++) {
    const randomIndex = Math.floor(Math.random() * emojiPool.length);
    randomEmojis.push(emojiPool[randomIndex]);
  }
  
  try {
    const prompt = emojiToPrompt(randomEmojis);
    const story = await generateStory(prompt, genre, length);
    const timestamp = new Date().toISOString();
    const storyId = generateStoryId();

    const storyEntry = { 
      id: storyId,
      emojis: randomEmojis, 
      story, 
      genre, 
      length,
      timestamp,
      likes: 0,
      randomlyGenerated: true
    };
    
    storyHistory.push(storyEntry);
    totalStoriesGenerated++;

    res.json({ 
      id: storyId,
      story,
      emojis: randomEmojis,
      genre,
      length,
      timestamp
    });
  } catch (error) {
    console.error("Error generating random emoji story:", error);
    res.status(500).json({ error: "Failed to generate story" });
  }
});


app.get("/search", (req, res) => {
  const { query } = req.query;
  
  if (!query) {
    return res.status(400).json({ error: "Search query is required" });
  }
  
  const searchTerm = query.toLowerCase();
  const results = storyHistory.filter(story => 
    story.story.toLowerCase().includes(searchTerm)
  );
  
  res.json({ results });
});


app.get("/docs", (req, res) => {
  const apiDocs = {
    name: "Emoji Story Generator API",
    version: "1.0.0",
    description: "Generate creative stories based on emoji combinations",
    baseUrl: `http://localhost:${PORT}`,
    endpoints: [
      {
        path: "/health",
        method: "GET",
        description: "Check API health status",
        parameters: [],
        responseExample: {
          status: "ok",
          uptime: 123.45,
          version: "1.0.0"
        }
      },
      {
        path: "/generate",
        method: "POST",
        description: "Generate a story based on provided emojis",
        parameters: [
          { name: "emojis", type: "array", required: true, description: "Array of emoji characters" },
          { name: "genre", type: "string", required: false, description: "Story genre (general, comedy, romance, horror, fantasy, sci-fi, mystery)", default: "general" },
          { name: "length", type: "string", required: false, description: "Story length (short, medium, long)", default: "medium" }
        ],
        requestExample: {
          emojis: ["🚀", "👽", "🌍"],
          genre: "sci-fi",
          length: "medium"
        },
        responseExample: {
          id: "lkj7ac3d4",
          story: "A story about space exploration...",
          emojis: ["🚀", "👽", "🌍"],
          genre: "sci-fi",
          length: "medium",
          timestamp: "2025-02-27T12:34:56.789Z"
        }
      },
      {
        path: "/random-emoji-story",
        method: "POST",
        description: "Generate a story with randomly selected emojis",
        parameters: [
          { name: "count", type: "number", required: false, description: "Number of random emojis (max 5)", default: 3 },
          { name: "genre", type: "string", required: false, description: "Story genre", default: "general" },
          { name: "length", type: "string", required: false, description: "Story length", default: "medium" }
        ],
        requestExample: {
          count: 4,
          genre: "fantasy",
          length: "long"
        },
        responseExample: {
          id: "mn5op7qr9",
          story: "A magical tale...",
          emojis: ["🧙", "🐉", "🏰", "💎"],
          genre: "fantasy",
          length: "long",
          timestamp: "2025-02-27T12:34:56.789Z"
        }
      },
      {
        path: "/story/:id",
        method: "GET",
        description: "Retrieve a specific story by ID",
        parameters: [
          { name: "id", type: "string", required: true, description: "Unique story identifier", in: "path" }
        ],
        responseExample: {
          id: "lkj7ab3d5",
          emojis: ["🚀", "👽", "🌍"],
          story: "A story about space exploration...",
          genre: "sci-fi",
          length: "medium",
          timestamp: "2025-02-27T12:34:56.789Z",
          likes: 7
        }
      },
      {
        path: "/story/:id/like",
        method: "POST",
        description: "Like a specific story",
        parameters: [
          { name: "id", type: "string", required: true, description: "Unique story identifier", in: "path" }
        ],
        responseExample: {
          likes: 3
        }
      },
      {
        path: "/random",
        method: "GET",
        description: "Get a random story from history",
        parameters: [],
        responseExample: {
          id: "xy2z3ab4c",
          emojis: ["🎮", "👾", "🏆"],
          story: "A gaming adventure...",
          genre: "general",
          length: "medium",
          timestamp: "2025-02-27T12:34:56.789Z",
          likes: 3
        }
      },
      {
        path: "/history",
        method: "GET",
        description: "Retrieve story history with pagination",
        parameters: [
          { name: "page", type: "number", required: false, description: "Page number", in: "query", default: 1 },
          { name: "limit", type: "number", required: false, description: "Number of items per page", in: "query", default: 10 }
        ],
        responseExample: {
          stories: [
            {
              id: "ab1cd2ef3",
              emojis: ["🌈", "🦄", "🌟"],
              story: "Once upon a time...",
              genre: "fantasy",
              length: "short",
              timestamp: "2025-03-27T12:34:56.789Z",
              likes: 7
            }
          ],
          pagination: {
            total: 56,
            pages: 5,
            currentPage: 1
          }
        }
      },
      {
        path: "/search",
        method: "GET",
        description: "Search stories by content",
        parameters: [
          { name: "query", type: "string", required: true, description: "Search term", in: "query" }
        ],
        responseExample: {
          results: [
            {
              id: "gh5ij6kl7",
              emojis: ["🚗", "🏁", "💨"],
              story: "The race was about to begin...",
              genre: "general",
              length: "medium",
              timestamp: "2025-02-27T12:34:56.789Z",
              likes: 2
            }
          ]
        }
      },
      
      {
        path: "/stats",
        method: "GET",
        description: "Get usage statistics",
        parameters: [],
        responseExample: {
          totalStoriesGenerated: 84,
          storiesInHistory: 42,
          topEmojis: [
            { emoji: "🚀", count: 15 },
            { emoji: "😍", count: 12 },
            { emoji: "🌈", count: 10 }
          ]
        }
      },
      {
        path: "/docs",
        method: "GET",
        description: "API documentation",
        parameters: [],
        responseExample: "Documentation for the API"
      }
    ]
  };
  res.json(apiDocs);
});

app.use((err, req, res, next) => {
  console.error("Server error:", err);
  res.status(500).json({ 
    error: "Server error occurred "
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`API available at http://localhost:${PORT}`);
  console.log(`API documentation available at http://localhost:${PORT}/docs`);
});