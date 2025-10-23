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
// ✅ Nueva versión compatible con sistema global de experiencia
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

    // Sumar XP total (acumulativo)
    const newExperience = (char.experience || 0) + 100;

    // Reusar el mismo cálculo de bots.js para mantener coherencia
    const { newLevel, leveledUp, levelsGained } = calculatePlayerLevel(newExperience, char.level || 1);

    const newSkillPoints = (char.available_skill_points || 0) + (levelsGained * 5);

    const { data: updatedChar, error: updateError } = await supabase
      .from("characters")
      .update({
        experience: newExperience,
        level: newLevel,
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
      leveledUp,
    });
  } catch (err) {
    console.error("❌ Error en train:", err);
    return res.status(500).json({ error: "Error interno en entrenamiento" });
  }
});

/* ===============================
   Copiar esta función del bots.js
   =============================== */
function calculatePlayerLevel(experience, currentLevel = 1) {
  const exp = experience || 0;

  const levelThresholds = [0];
  let next = 100;
  for (let i = 1; i <= 100; i++) {
    levelThresholds.push(Math.round(levelThresholds[i - 1] + next));
    next *= 1.05;
  }

  let newLevel = 1;
  for (let i = levelThresholds.length - 1; i >= 0; i--) {
    if (exp >= levelThresholds[i]) {
      newLevel = i + 1;
      break;
    }
  }

  const leveledUp = newLevel > currentLevel;
  const levelsGained = leveledUp ? newLevel - currentLevel : 0;

  return { newLevel, leveledUp, levelsGained };
}

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

export default router;
