import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import characterRoutes from "./routes/characters.js";
import botRoutes from "./routes/bots.js";
import clubRoutes from "./routes/clubs.js";
import walletsRouter from './routes/wallets.js';

dotenv.config();  

const app = express();

// Configuración CORS más permisiva
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

// Manejar preflight requests
app.options('*', cors(corsOptions));

app.use(express.json());

// Conexión a Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Middleware para agregar headers CORS manualmente si es necesario
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  next();
});

// Rutas de prueba
app.get("/", (req, res) => {
  res.json({ 
    message: "🐺 LupiApp Backend corriendo...",
    timestamp: new Date().toISOString()
  });
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ 
    status: "OK", 
    message: "Backend funcionando correctamente",
    timestamp: new Date().toISOString()
  });
});

// Listar perfiles
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
    const { user_id, nickname } = req.body;

    const { data, error } = await supabase.from("characters").insert([
      {
        user_id,
        nickname,
      },
    ]).select().single();

    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ======================================
// ⭐️ FUNCIÓN HELPER PARA LA PROGRESIÓN (REGLA DEL JUEGO)
// Define la misma fórmula que usaste en el cliente
// ======================================
const getExpToNextLevel = (level) => {
    // FÓRMULA DE EJEMPLO: 100 + Nivel * 50 * (Nivel / 2)
    return Math.floor(100 + level * 50 * (level / 2));
};

// ======================================
// ⭐️ NUEVO ENDPOINT SEGURO PARA EL ENTRENAMIENTO
// ======================================
app.post("/characters/train", async (req, res) => {
    try {
        // 1. EXTRACT FROM PARAMS AND BODY
        // 🔑 El characterId ahora se extrae de los parámetros de la URL
        const { characterId } = req.params; 
        // La EXP se sigue enviando en el cuerpo del POST
        const { expGained } = req.body;     

        if (!characterId || typeof expGained !== 'number') {
            return res.status(400).json({ error: "Faltan characterId o expGained válidos." });
        }
        
        // 1. OBTENER ESTADO ACTUAL
        // Usamos la variable 'supabase' que ya está inicializada con el Service Role Key.
        const { data: character, error: fetchError } = await supabase
            .from("characters")
            .select("id, exp, level, strength, agility") // Solo los campos necesarios
            .eq("id", characterId)
            .maybeSingle();

        if (fetchError || !character) {
            return res.status(404).json({ error: "Personaje no encontrado." });
        }

        // 2. APLICAR LÓGICA DE NIVELACIÓN (EN EL SERVIDOR)
        let currentExp = character.exp || 0;
        let currentLevel = character.level || 1;
        let newExp = currentExp + expGained;
        let newLevel = currentLevel;
        let levelUpOccurred = false;

        // Bucle para manejar múltiples subidas de nivel de golpe
        let expRequired = getExpToNextLevel(newLevel);
        
        while (newExp >= expRequired) {
            newLevel++;
            newExp -= expRequired;
            expRequired = getExpToNextLevel(newLevel);
            levelUpOccurred = true;
        }

        // 3. DEFINIR ACTUALIZACIONES (incluyendo el incremento de STATS)
        const updates = {
            exp: newExp,
            level: newLevel,
            // Ejemplo de cálculo de stats:
            strength: newLevel * 2, 
            agility: newLevel * 2 
        };

        // 4. ACTUALIZAR LA BASE DE DATOS (Servicio de Rol de Supabase)
        const { data: updatedCharacter, error: updateError } = await supabase
            .from("characters")
            .update(updates)
            .eq("id", characterId)
            .select()
            .single();

        if (updateError) throw updateError;

        // 5. ENVIAR RESPUESTA AL CLIENTE
        res.json({ 
            message: "Entrenamiento completado y progreso guardado.",
            character: updatedCharacter, // El cliente necesita esta data actualizada
            levelUpOccurred 
        });

    } catch (error) {
        console.error('❌ Error en /characters/train:', error);
        res.status(500).json({ error: 'Error interno del servidor.', message: error.message });
    }
});

// Rutas principales
app.use("/characters", characterRoutes);
app.use("/bots", botRoutes);
app.use("/clubs", clubRoutes);
app.use('/api/wallets', walletsRouter);

// Obtener personaje por user_id
app.get("/characters/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const { data, error } = await supabase
      .from("characters")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Wallet por personaje
app.get("/wallets/:characterId", async (req, res) => {
  try {
    const { characterId } = req.params;
    const { data, error } = await supabase
      .from("wallets")
      .select("*")
      .eq("character_id", characterId)
      .maybeSingle();

    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Manejo de errores global
app.use((err, req, res, next) => {
  console.error('❌ Error global:', err);
  res.status(500).json({ 
    error: 'Error interno del servidor',
    message: err.message 
  });
});

// Ruta no encontrada
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🚀 LupiApp backend escuchando en http://localhost:${PORT}`);
  console.log(`🌐 CORS habilitado para múltiples orígenes`);
});
