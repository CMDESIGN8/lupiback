// routes/wallets.js - NUEVO ARCHIVO
import express from "express";
import { supabase } from "../supabaseClient.js";
const router = express.Router();

router.get("/:characterId", async (req, res) => {
  const { characterId } = req.params;
  try {
    const { data: wallet, error } = await supabase
      .from("wallets")
      .select("*")
      .eq("character_id", characterId)
      .single();
    
    if (error || !wallet) {
      return res.status(404).json({ error: "Wallet no encontrada" });
    }
    
    return res.json(wallet);
  } catch (err) {
    console.error("❌ Error obteniendo wallet:", err);
    return res.status(500).json({ error: "Error interno" });
  }
});

export default router;
