// routes/characters.js
import express from "express";
import { supabase } from "../supabaseClient.js";

const router = express.Router();

/* ===============================
   Helper: experiencia por nivel
   =============================== */
function xpForLevel(level) {
  return Math.floor(100 * Math.pow(1.2, level - 1));
}

/* ===============================
   TRAIN: Entrenar personaje
   =============================== */
router.post("/:id/train", async (req, res) => {
  const { id } = req.params;

  try {
    const { data: char, error: charError } = await supabase
      .from("characters")
      .select("*")
      .eq("id", id)
      .single();

    if (charError || !char)
      return res.status(404).json({ error: "Personaje no encontrado" });

    const { data: wallet, error: walletError } = await supabase
      .from("wallets")
      .select("*")
      .eq("character_id", id)
      .single();

    if (walletError || !wallet)
      return res.status(404).json({ error: "Wallet no encontrada" });

    let newExp = char.experience + 100;
    let newLevel = char.level;
    let newSkillPoints = char.available_skill_points || 0;
    let expNeeded = xpForLevel(newLevel);

    // subir de nivel progresivo
    while (newExp >= expNeeded) {
      newExp -= expNeeded;
      newLevel++;
      newSkillPoints += 5;
      expNeeded = xpForLevel(newLevel);
    }

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

    if (updateError)
      return res.status(400).json({ error: updateError.message });

    const { data: updatedWallet, error: walletUpdateError } = await supabase
      .from("wallets")
      .update({ lupicoins: wallet.lupicoins + 150 })
      .eq("id", wallet.id)
      .select()
      .single();

    if (walletUpdateError)
      return res.status(400).json({ error: walletUpdateError.message });

    return res.json({
      character: updatedChar,
      wallet: updatedWallet,
      leveledUp: newLevel > char.level,
    });
  } catch (err) {
    console.error("❌ Error en train:", err);
    return res.status(500).json({ error: "Error interno en entrenamiento" });
  }
});

/* ===============================
   STAT: Subir un skill individual
   =============================== */
router.put("/:id/stat", async (req, res) => {
  const { id } = req.params;
  const { skillKey } = req.body; // ejemplo: "velocidad"

  if (!skillKey)
    return res.status(400).json({ error: "No se indicó skill" });

  try {
    const { data: char, error: charError } = await supabase
      .from("characters")
      .select("*")
      .eq("id", id)
      .single();

    if (charError || !char)
      return res.status(404).json({ error: "Personaje no encontrado" });

    if (char.available_skill_points <= 0)
      return res.status(400).json({ error: "No quedan skill points" });

    const currentValue = char[skillKey] || 0;
    if (currentValue >= 100)
      return res.status(400).json({ error: "Skill ya está al máximo (100)" });

    const newValue = Math.min(currentValue + 1, 100);

    const { data: updatedChar, error: updateError } = await supabase
      .from("characters")
      .update({
        [skillKey]: newValue,
        available_skill_points: char.available_skill_points - 1,
      })
      .eq("id", id)
      .select()
      .single();

    if (updateError)
      return res.status(400).json({ error: updateError.message });

    return res.json({ character: updatedChar });
  } catch (err) {
    console.error("❌ Error en PUT /stat:", err);
    return res.status(500).json({ error: "Error interno al subir skill" });
  }
});

/* ===============================
   GET: Obtener personaje por ID
   =============================== */
router.get("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const { data: char, error: charError } = await supabase
      .from("characters")
      .select("*")
      .eq("id", id)
      .single();
    
    if (charError || !char) {
      return res.status(404).json({ error: "Personaje no encontrado" });
    }
    
    return res.json(char);
  } catch (err) {
    console.error("❌ Error obteniendo personaje:", err);
    return res.status(500).json({ error: "Error interno" });
  }
});

/* ===============================
   GET: Obtener wallet por character_id
   =============================== */
router.get("/wallets/:characterId", async (req, res) => {
  const { characterId } = req.params;
  try {
    const { data: wallet, error: walletError } = await supabase
      .from("wallets")
      .select("*")
      .eq("character_id", characterId)
      .single();
    
    if (walletError || !wallet) {
      return res.status(404).json({ error: "Wallet no encontrada" });
    }
    
    return res.json(wallet);
  } catch (err) {
    console.error("❌ Error obteniendo wallet:", err);
    return res.status(500).json({ error: "Error interno" });
  }
});

export default router;
