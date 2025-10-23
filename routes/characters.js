// routes/characters.js
import express from "express";
import { supabase } from "../supabaseClient.js";

const router = express.Router();

/* ===============================
   SISTEMA DE EXPERIENCIA GLOBAL
   =============================== */
function calculatePlayerLevel(experience, currentLevel = 1) {
  const exp = experience || 0;

  // Tabla progresiva: cada nivel requiere 5% más XP que el anterior
  const levelThresholds = [0];
  let next = 100;
  for (let i = 1; i <= 100; i++) {
    levelThresholds.push(Math.round(levelThresholds[i - 1] + next));
    next *= 1.05;
  }

  // Buscar el nivel alcanzado según XP total
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

    if (walletError && walletError.code !== "PGRST116")
      return res.status(404).json({ error: "Wallet no encontrada" });

    // XP total acumulativa
    const newExperience = (char.experience || 0) + 100;

    // Calcular nivel nuevo con la misma lógica que /bots.js
    const { newLevel, leveledUp, levelsGained } = calculatePlayerLevel(
      newExperience,
      char.level || 1
    );

    const newSkillPoints =
      (char.available_skill_points || 0) + (levelsGained * 5);

    // Actualizar personaje
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

    // Actualizar / crear wallet
    let newLupicoins = 150;
    if (wallet) {
      newLupicoins = (wallet.lupicoins || 0) + 150;
      await supabase
        .from("wallets")
        .update({ lupicoins: newLupicoins })
        .eq("id", wallet.id);
    } else {
      await supabase
        .from("wallets")
        .insert([
          {
            character_id: id,
            lupicoins: newLupicoins,
            address: `wallet_${id}_${Date.now()}`,
          },
        ]);
    }

    return res.json({
      success: true,
      message: "Entrenamiento completado correctamente",
      character: updatedChar,
      leveledUp,
      levelsGained,
      wallet: {
        coinsEarned: 150,
        totalCoins: newLupicoins,
      },
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

    return res.json({ success: true, character: updatedChar });
  } catch (err) {
    console.error("❌ Error en PUT /stat:", err);
    return res.status(500).json({ error: "Error interno al subir skill" });
  }
});

export default router;
