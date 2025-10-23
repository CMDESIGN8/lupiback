// routes/characters.js
import express from "express";
import { supabase } from "../supabaseClient.js";

const router = express.Router();

/* ===============================
   CREATE: Crear nuevo personaje
   =============================== */
router.post("/", async (req, res) => {
  const {
    user_id,
    name,
    position = 'delantero',
    velocidad = 50,
    pase = 50,
    potencia = 50,
    tiro = 50,
    regate = 50,
    tecnica = 50,
    estrategia = 50,
    inteligencia = 50,
    defensa = 50,
    resistencia_base = 50,
    liderazgo = 50
  } = req.body;

  try {
    if (!user_id || !name) {
      return res.status(400).json({ error: "Faltan campos obligatorios: user_id y name" });
    }

    console.log('👤 Verificando/Creando perfil para usuario:', user_id);

    // ✅ 1️⃣ Verificar si el usuario existe en profiles
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", user_id)
      .maybeSingle();

    if (profileError) {
      console.error('❌ Error verificando perfil:', profileError);
      return res.status(500).json({ error: "Error verificando usuario" });
    }

    // ✅ 2️⃣ Si no existe, crearlo automáticamente
    if (!profile) {
      console.log('📝 Creando nuevo perfil...');
      const { error: createProfileError } = await supabase
        .from("profiles")
        .insert([{ 
          id: user_id, 
          created_at: new Date().toISOString() 
        }]);

      if (createProfileError) {
        console.error('❌ Error creando perfil:', createProfileError);
        return res.status(500).json({
          error: "No se pudo crear el perfil automáticamente",
          details: createProfileError.message,
        });
      }
      console.log('✅ Perfil creado exitosamente');
    } else {
      console.log('✅ Perfil ya existe');
    }

    // ✅ 3️⃣ Crear personaje vinculado
    console.log('🎮 Creando personaje...');
    const characterData = {
      user_id: user_id,
      nickname: name,
      position,
      velocidad,
      pase,
      potencia,
      tiro,
      regate,
      tecnica,
      estrategia,
      inteligencia,
      defensa,
      resistencia_base,
      liderazgo,
      level: 1,
      experience: 0,
      experience_to_next_level: 100,
      available_skill_points: 0,
    };

    console.log('📤 Datos del personaje:', characterData);

    const { data: newCharacter, error: insertError } = await supabase
      .from("characters")
      .insert([characterData])
      .select()
      .single();

    if (insertError) {
      console.error('❌ Error creando personaje:', insertError);
      return res.status(400).json({ 
        error: "Error creando personaje", 
        details: insertError.message,
        code: insertError.code 
      });
    }

    console.log('✅ Personaje creado:', newCharacter.id);

    // ✅ 4️⃣ Crear wallet asociada automáticamente
    console.log('💰 Creando wallet...');
    const walletAddress = `${name.toLowerCase().replace(/\s+/g, '')}.lupi`;
    const { data: wallet, error: walletError } = await supabase
      .from("wallets")
      .insert([{ 
        character_id: newCharacter.id, 
        address: walletAddress, 
        lupicoins: 100.00 
      }])
      .select()
      .single();

    if (walletError) {
      console.warn("⚠️ No se pudo crear la wallet automáticamente:", walletError.message);
      // No retornamos error aquí porque el personaje ya fue creado
    } else {
      console.log('✅ Wallet creada:', walletAddress);
    }

    return res.json({ 
      success: true,
      character: newCharacter, 
      wallet: wallet || { address: walletAddress, lupicoins: 100.00 }
    });

  } catch (err) {
    console.error("❌ Error inesperado creando personaje:", err);
    return res.status(500).json({ 
      error: "Error interno al crear personaje",
      details: err.message 
    });
  }
});

/* ===============================
   SISTEMA DE EXPERIENCIA GLOBAL
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

    // Calcular nivel nuevo
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
  const { skillKey } = req.body;

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
