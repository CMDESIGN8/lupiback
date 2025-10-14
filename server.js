import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import characterRoutes from "./routes/characters.js";


dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Conexión a Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // full access en backend
);

// Ruta de prueba
app.get("/", (req, res) => {
  res.send("🐺 LupiApp Backend corriendo...");
});

// ----------------------
// PERFILES
// ----------------------
app.get("/profiles", async (req, res) => {
  const { data, error } = await supabase.from("profiles").select("*").limit(10);
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// ----------------------
// PERSONAJES
// ----------------------

app.use("/characters", characterRoutes);

// Crear personaje
app.post("/characters", async (req, res) => {
  const { user_id, nickname } = req.body;
  const { data, error } = await supabase
    .from("characters")
    .insert([{ user_id, nickname }])
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// Obtener personaje por user_id
app.get("/characters/:userId", async (req, res) => {
  const { userId } = req.params;
  const { data, error } = await supabase
    .from("characters")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// ----------------------
// WALLETS
// ----------------------
app.get("/wallets/:characterId", async (req, res) => {
  const { characterId } = req.params;
  const { data, error } = await supabase
    .from("wallets")
    .select("*")
    .eq("character_id", characterId)
    .maybeSingle();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// ----------------------
// STATS
// ----------------------
app.post("/characters/:characterId/stats", async (req, res) => {
  const { characterId } = req.params;
  const { stat } = req.body;

  // Obtenemos el personaje
  const { data: character, error: getError } = await supabase
    .from("characters")
    .select("*")
    .eq("id", characterId)
    .maybeSingle();

  if (getError || !character) return res.status(404).json({ error: "Personaje no encontrado" });

  // Aumentamos la stat (ejemplo simple)
  const updatedCharacter = {
    ...character,
    [stat]: (character[stat] || 0) + 1
  };

  const { data, error: updateError } = await supabase
    .from("characters")
    .update(updatedCharacter)
    .eq("id", characterId)
    .select()
    .single();

  if (updateError) return res.status(400).json({ error: updateError.message });
  res.json(data);
});

// ----------------------
// ENTRENAMIENTO
// ----------------------
app.post("/characters/:characterId/train", async (req, res) => {
  const { characterId } = req.params;

  // Obtenemos el personaje
  const { data: character, error: getError } = await supabase
    .from("characters")
    .select("*")
    .eq("id", characterId)
    .maybeSingle();

  if (getError || !character) return res.status(404).json({ error: "Personaje no encontrado" });

  // Lógica de entrenamiento: ejemplo
  const updatedCharacter = {
    experience: (character.experience || 0) + 10,
    skill_points: (character.skill_points || 0) + 1,
  };

  const { data, error: updateError } = await supabase
    .from("characters")
    .update(updatedCharacter)
    .eq("id", characterId)
    .select()
    .single();

  if (updateError) return res.status(400).json({ error: updateError.message });
  res.json(data);
});

// ----------------------
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🚀 LupiApp backend escuchando en http://localhost:${PORT}`);
});
