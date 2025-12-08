import express from "express";
const router = express.Router();

import { supabase } from "../app.js";

// ======================================
// HELPER FUNCTIONS
// ======================================

function xpForLevel(level) {
  return Math.floor(100 * Math.pow(1.2, level - 1));
}

// ======================================
// GET CHARACTER BY ID
// ======================================
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`🔍 GET /characters/${id}`);

    const { data, error } = await supabase
      .from("characters")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      console.error("❌ Error en Supabase:", error);
      return res.status(400).json({ error: error.message });
    }

    if (!data) {
      return res.status(404).json({ 
        error: "Personaje no encontrado",
        message: `No se encontró personaje con ID: ${id}`
      });
    }

    res.json(data);
  } catch (error) {
    console.error("❌ Error en GET /characters/:id:", error);
    res.status(500).json({ 
      error: "Error interno del servidor",
      message: error.message 
    });
  }
});

// ======================================
// TRAIN CHARACTER
// ======================================
router.post("/:id/train", async (req, res) => {
  const { id } = req.params;
  const { expGained = 100 } = req.body; // Valor por defecto 100

  console.log(`🏋️‍♂️ POST /characters/${id}/train con expGained: ${expGained}`);

  try {
    // 1. Obtener personaje actual
    const { data: character, error: charError } = await supabase
      .from("characters")
      .select("*")
      .eq("id", id)
      .single();

    if (charError || !character) {
      console.error("❌ Personaje no encontrado:", charError);
      return res.status(404).json({ error: "Personaje no encontrado" });
    }

    console.log(`📊 Personaje actual: Level ${character.level}, Exp ${character.experience}`);

    // 2. Obtener wallet del personaje
    const { data: wallet, error: walletError } = await supabase
      .from("wallets")
      .select("*")
      .eq("character_id", id)
      .maybeSingle();

    // Si no existe wallet, crear una
    let currentWallet = wallet;
    if (!wallet) {
      console.log(`💰 Creando wallet para character ${id}`);
      const { data: newWallet, error: createError } = await supabase
        .from("wallets")
        .insert([{ character_id: id, lupicoins: 100 }])
        .select()
        .single();
      
      if (createError) {
        console.error("❌ Error creando wallet:", createError);
        return res.status(400).json({ error: "Error creando wallet" });
      }
      currentWallet = newWallet;
    }

    // 3. Calcular nueva experiencia y nivel
    let newExp = (character.experience || 0) + expGained;
    let newLevel = character.level || 1;
    let newSkillPoints = character.available_skill_points || 0;
    let expNeeded = xpForLevel(newLevel);
    let leveledUp = false;
    let levelsGained = 0;

    // Subir de nivel progresivo
    while (newExp >= expNeeded) {
      newExp -= expNeeded;
      newLevel++;
      newSkillPoints += 5;
      levelsGained++;
      leveledUp = true;
      expNeeded = xpForLevel(newLevel);
      console.log(`⬆️ Subió a nivel ${newLevel}! Exp restante: ${newExp}`);
    }

    // 4. Actualizar personaje
    const characterUpdates = {
      experience: newExp,
      level: newLevel,
      experience_to_next_level: expNeeded,
      available_skill_points: newSkillPoints,
      updated_at: new Date().toISOString()
    };

    const { data: updatedCharacter, error: updateError } = await supabase
      .from("characters")
      .update(characterUpdates)
      .eq("id", id)
      .select()
      .single();

    if (updateError) {
      console.error("❌ Error actualizando personaje:", updateError);
      return res.status(400).json({ error: updateError.message });
    }

    // 5. Actualizar wallet (dar recompensa)
    const walletUpdates = {
      lupicoins: (currentWallet.lupicoins || 0) + 150,
      updated_at: new Date().toISOString()
    };

    const { data: updatedWallet, error: walletUpdateError } = await supabase
      .from("wallets")
      .update(walletUpdates)
      .eq("character_id", id)
      .select()
      .single();

    if (walletUpdateError) {
      console.error("❌ Error actualizando wallet:", walletUpdateError);
      return res.status(400).json({ error: walletUpdateError.message });
    }

    console.log(`✅ Entrenamiento completado: Level ${newLevel}, Exp ${newExp}, +150 Lupicoins`);

    // 6. Respuesta
    return res.json({
      success: true,
      message: "Entrenamiento completado exitosamente",
      character: updatedCharacter,
      wallet: updatedWallet,
      leveledUp,
      levelsGained,
      expGained,
      coinsGained: 150,
      stats: {
        previousLevel: character.level,
        newLevel,
        previousExp: character.experience,
        newExp,
        expNeeded
      }
    });

  } catch (err) {
    console.error("❌ Error inesperado en /train:", err);
    return res.status(500).json({ 
      error: "Error interno en entrenamiento",
      message: err.message 
    });
  }
});

// ======================================
// UPGRADE STAT
// ======================================
router.put("/:id/stat", async (req, res) => {
  const { id } = req.params;
  const { skillKey, amount = 1 } = req.body;

  console.log(`📈 PUT /characters/${id}/stat - Skill: ${skillKey}, Amount: ${amount}`);

  // Validar skillKey
  const validSkills = [
    'strength', 'agility', 'intelligence', 'charisma', 
    'endurance', 'speed', 'luck', 'vitality'
  ];

  if (!skillKey || !validSkills.includes(skillKey)) {
    return res.status(400).json({ 
      error: "Skill inválido",
      validSkills: validSkills
    });
  }

  if (amount <= 0 || amount > 10) {
    return res.status(400).json({ 
      error: "Cantidad inválida",
      message: "La cantidad debe estar entre 1 y 10"
    });
  }

  try {
    // 1. Obtener personaje
    const { data: character, error: charError } = await supabase
      .from("characters")
      .select("*")
      .eq("id", id)
      .single();

    if (charError || !character) {
      return res.status(404).json({ error: "Personaje no encontrado" });
    }

    // 2. Verificar skill points disponibles
    const availablePoints = character.available_skill_points || 0;
    if (availablePoints < amount) {
      return res.status(400).json({ 
        error: "Skill points insuficientes",
        available: availablePoints,
        required: amount
      });
    }

    // 3. Verificar límite máximo
    const currentValue = character[skillKey] || 0;
    const newValue = Math.min(currentValue + amount, 100);
    
    if (currentValue >= 100) {
      return res.status(400).json({ 
        error: "Skill ya está al máximo (100)",
        currentValue: currentValue
      });
    }

    // 4. Actualizar
    const updates = {
      [skillKey]: newValue,
      available_skill_points: availablePoints - amount,
      updated_at: new Date().toISOString()
    };

    const { data: updatedCharacter, error: updateError } = await supabase
      .from("characters")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (updateError) {
      console.error("❌ Error actualizando skill:", updateError);
      return res.status(400).json({ error: updateError.message });
    }

    console.log(`✅ Skill ${skillKey} mejorado: ${currentValue} → ${newValue}`);

    return res.json({
      success: true,
      message: `Skill ${skillKey} mejorado exitosamente`,
      character: updatedCharacter,
      skillUpgraded: {
        skill: skillKey,
        previousValue: currentValue,
        newValue,
        pointsUsed: amount,
        remainingPoints: updatedCharacter.available_skill_points
      }
    });

  } catch (err) {
    console.error("❌ Error inesperado en /stat:", err);
    return res.status(500).json({ 
      error: "Error interno al mejorar skill",
      message: err.message 
    });
  }
});

// ======================================
// GET ALL CHARACTERS (para admin/debug)
// ======================================
router.get("/", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("characters")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error("❌ Error obteniendo personajes:", error);
      return res.status(400).json({ error: error.message });
    }

    res.json({
      count: data.length,
      characters: data
    });
  } catch (error) {
    console.error("❌ Error en GET /characters:", error);
    res.status(500).json({ 
      error: "Error interno del servidor",
      message: error.message 
    });
  }
});

export default router;
