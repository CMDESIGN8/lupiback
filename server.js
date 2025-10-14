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

// Calcular experiencia necesaria para un nivel dado
function xpForLevel(level) {
  // Fórmula exponencial ligera
  return Math.floor(100 * Math.pow(1.2, level - 1));
}
const router = express.Router();

router.post("/:id/train", async (req, res) => {
  const { id } = req.params;

  try {
    const { data: char, error: charError } = await supabase
      .from("characters")
      .select("*")
      .eq("id", id)
      .single();

    if (charError || !char) {
      return res.status(400).json({ error: "Personaje no encontrado" });
    }

    const { data: wallet, error: walletError } = await supabase
      .from("wallets")
      .select("*")
      .eq("character_id", id)
      .single();

    if (walletError || !wallet) {
      return res.status(400).json({ error: "Wallet no encontrada" });
    }

    let newExp = char.experience + 100;
    let newLevel = char.level;
    let newSkillPoints = char.available_skill_points || 0;
    let expNeeded = xpForLevel(newLevel);

    // Subir de nivel progresivamente si alcanza
    while (newExp >= expNeeded) {
      newExp -= expNeeded;       // rollover XP
      newLevel++;                // subir nivel
      newSkillPoints += 5;       // bonus
      expNeeded = xpForLevel(newLevel);
    }

    // Actualizar personaje
    const { data: updatedChar, error: updateError } = await supabase
      .from("characters")
      .update({
        experience: newExp,
        level: newLevel,
        experience_to_next_level: expNeeded,
        available_skill_points: newSkillPoints,
      })
      .eq("id", id)
      .select()
      .single();

    if (updateError) {
      return res.status(400).json({ error: updateError.message });
    }

    // Actualizar wallet
    const { data: updatedWallet, error: walletUpdateError } = await supabase
      .from("wallets")
      .update({
        lupicoins: wallet.lupicoins + 150,
      })
      .eq("id", wallet.id)
      .select()
      .single();

    if (walletUpdateError) {
      return res.status(400).json({ error: walletUpdateError.message });
    }

    return res.json({
      character: updatedChar,
      wallet: updatedWallet,
      leveledUp: newLevel > char.level, // 👍 para mostrar popup en frontend
    });
  } catch (err) {
    console.error("❌ Error en train:", err);
    return res.status(500).json({ error: "Error interno en entrenamiento" });
  }
});

// ----------------------
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🚀 LupiApp backend escuchando en http://localhost:${PORT}`);
});
