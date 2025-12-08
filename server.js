import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import characterRoutes from "./routes/characters.js";
import botRoutes from "./routes/bots.js";
import clubRoutes from "./routes/clubs.js";

dotenv.config();

const app = express();

// Configuración CORS
const corsOptions = {
  origin: [
    'https://lupi-2fga.onrender.com',
    'http://localhost:3000',
    'http://localhost:5173',
    'https://*.onrender.com'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json());

// Conexión a Supabase (exportamos para usar en las rutas)
export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Middleware de logging para debug
app.use((req, res, next) => {
  console.log(`📥 ${req.method} ${req.url}`);
  next();
});

// Rutas principales
app.use("/characters", characterRoutes);
app.use("/bots", botRoutes);
app.use("/clubs", clubRoutes);

// ======================================
// RUTAS DIRECTAS
// ======================================

// Home
app.get("/", (req, res) => {
  res.json({ 
    message: "🐺 LupiApp Backend corriendo...",
    endpoints: {
      characters: "/characters",
      health: "/health",
      profiles: "/profiles",
      wallets: "/wallets/:characterId"
    },
    timestamp: new Date().toISOString()
  });
});

// Health check
app.get("/health", (req, res) => {
  res.json({ 
    status: "OK", 
    message: "Backend funcionando correctamente",
    timestamp: new Date().toISOString()
  });
});

// Listar perfiles (para debug)
app.get("/profiles", async (req, res) => {
  try {
    const { data, error } = await supabase.from("profiles").select("*").limit(10);
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Crear personaje
app.post("/characters", async (req, res) => {
  try {
    console.log("📝 Creando personaje con datos:", req.body);
    
    const { user_id, nickname } = req.body;

    if (!user_id || !nickname) {
      return res.status(400).json({ error: "Faltan user_id o nickname" });
    }

    const { data, error } = await supabase
      .from("characters")
      .insert([
        {
          user_id,
          nickname,
          level: 1,
          experience: 0,
          available_skill_points: 0,
          created_at: new Date().toISOString()
        }
      ])
      .select()
      .single();

    if (error) {
      console.error("❌ Error creando personaje:", error);
      return res.status(400).json({ error: error.message });
    }

    console.log("✅ Personaje creado:", data);
    res.json(data);
  } catch (error) {
    console.error("❌ Error inesperado:", error);
    res.status(500).json({ error: error.message });
  }
});

// Obtener personaje por user_id (para el dashboard)
app.get("/characters/user/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    console.log(`🔍 Buscando personaje para userId: ${userId}`);

    const { data, error } = await supabase
      .from("characters")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.error("❌ Error en Supabase:", error);
      return res.status(400).json({ error: error.message });
    }

    console.log(`📊 Resultado: ${data ? 'Encontrado' : 'No encontrado'}`);
    
    if (!data) {
      return res.status(404).json({ 
        error: "Personaje no encontrado",
        message: "No se encontró un personaje para este usuario" 
      });
    }

    res.json(data);
  } catch (error) {
    console.error(`❌ Error en servidor:`, error);
    res.status(500).json({ 
      error: 'Error interno del servidor',
      message: error.message 
    });
  }
});

// Wallet por personaje
app.get("/wallets/:characterId", async (req, res) => {
  try {
    const { characterId } = req.params;
    console.log(`💰 Buscando wallet para characterId: ${characterId}`);

    const { data, error } = await supabase
      .from("wallets")
      .select("*")
      .eq("character_id", characterId)
      .maybeSingle();

    if (error) {
      console.error("❌ Error en Supabase:", error);
      return res.status(400).json({ error: error.message });
    }

    if (!data) {
      // Si no existe wallet, crear una por defecto
      console.log(`🆕 Creando wallet nueva para characterId: ${characterId}`);
      
      const { data: newWallet, error: createError } = await supabase
        .from("wallets")
        .insert([
          {
            character_id: characterId,
            lupicoins: 100,
            created_at: new Date().toISOString()
          }
        ])
        .select()
        .single();

      if (createError) {
        return res.status(400).json({ error: createError.message });
      }
      
      return res.json(newWallet);
    }

    res.json(data);
  } catch (error) {
    console.error(`❌ Error en servidor:`, error);
    res.status(500).json({ 
      error: 'Error interno del servidor',
      message: error.message 
    });
  }
});

// ======================================
// MANEJO DE ERRORES
// ======================================

// Ruta no encontrada
app.use('*', (req, res) => {
  console.log(`❌ Ruta no encontrada: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ 
    error: 'Ruta no encontrada',
    path: req.originalUrl,
    method: req.method
  });
});

// Error handler global
app.use((err, req, res, next) => {
  console.error('❌ Error global no manejado:', err);
  res.status(500).json({ 
    error: 'Error interno del servidor',
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

// Iniciar servidor
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🚀 LupiApp backend escuchando en http://localhost:${PORT}`);
  console.log(`🌐 CORS habilitado`);
  console.log(`📅 ${new Date().toLocaleString()}`);
});
