import express from "express";
import { supabase } from "../supabaseClient.js";

const router = express.Router();

/* ===============================
   GET BOTS
   =============================== */
router.get("/", async (req, res) => {
  try {
    const { data: bots, error } = await supabase
      .from("bots")
      .select("*")
      .order("level", { ascending: true });

    if (error) throw error;

    res.json({ bots });
  } catch (err) {
    console.error("❌ Error obteniendo bots:", err);
    res.status(500).json({ error: "Error interno al obtener bots" });
  }
});

/* ===============================
   START MATCH
   =============================== */
router.post("/match", async (req, res) => {
  const { characterId, botId } = req.body;

  try {
    const { data: character } = await supabase
      .from("characters")
      .select("*")
      .eq("id", characterId)
      .single();

    const { data: bot } = await supabase
      .from("bots")
      .select("*")
      .eq("id", botId)
      .single();

    if (!character) return res.status(404).json({ error: "Personaje no encontrado" });
    if (!bot) return res.status(404).json({ error: "Bot no encontrado" });

    const { data: insertedMatches, error: matchError } = await supabase
      .from("matches")
      .insert([
        {
          player1_id: characterId,
          player2_id: botId,
          match_type: "bot",
          status: "in_progress",
          started_at: new Date(),
        },
      ])
      .select("*");

    if (matchError) throw matchError;

    const match = insertedMatches?.[0];
    console.log("✅ Match creado:", match);

    res.json({ match, bot, message: `Partida contra ${bot.name} iniciada` });
  } catch (err) {
    console.error("❌ Error iniciando partida:", err);
    res.status(500).json({ error: "Error interno al iniciar partida" });
  }
});

/* ===============================
   SIMULATE MATCH
   =============================== */
router.post("/:matchId/simulate", async (req, res) => {
  const { matchId } = req.params;

  try {
    const { data: match } = await supabase
      .from("matches")
      .select(`
        *,
        player1:player1_id(*),
        player2:player2_id(*)
      `)
      .eq("id", matchId)
      .single();

    if (!match) return res.status(404).json({ error: "Partida no encontrada" });
    if (match.status !== "in_progress") return res.status(400).json({ error: "La partida ya terminó" });

    const simulation = simulateBotMatch(match.player1, match.player2);

    const { data: updatedMatch } = await supabase
      .from("matches")
      .update({
        player1_score: simulation.player1Score,
        player2_score: simulation.player2Score,
        winner_id: simulation.winnerId,
        status: "finished",
        finished_at: new Date(),
      })
      .eq("id", matchId)
      .select()
      .single();

    res.json({
      match: updatedMatch,
      simulation,
      message:
        simulation.winnerId === match.player1_id
          ? `¡Ganaste ${simulation.player1Score}-${simulation.player2Score}!`
          : simulation.player1Score === simulation.player2Score
          ? `Empate ${simulation.player1Score}-${simulation.player2Score}`
          : `Perdiste ${simulation.player1Score}-${simulation.player2Score}`,
    });
  } catch (err) {
    console.error("❌ Error simulando partida:", err);
    res.status(500).json({ error: "Error interno al simular partida" });
  }
});

/* ===============================
   FUNCIONES AUXILIARES
   =============================== */
function simulateBotMatch(player, bot) {
  const playerStats = averageStats(player);
  const botStats = averageStats(bot);
  const levelDiff = (player.level || 1) - (bot.level || 1);

  let playerScore = Math.floor(Math.random() * 3) + 1;
  let botScore = Math.floor(Math.random() * 3) + 1;

  const advantage = (playerStats - botStats) / 100 + levelDiff * 0.1;

  if (advantage > 0) playerScore += 1;
  if (advantage < 0) botScore += 1;

  const winnerId = playerScore > botScore ? player.id : botScore > playerScore ? bot.id : null;

  return { player1Score: playerScore, player2Score: botScore, winnerId };
}

function averageStats(c) {
  const stats = ["pase", "tiro", "regate", "velocidad", "defensa", "potencia"];
  return stats.reduce((sum, s) => sum + (c[s] || 50), 0) / stats.length;
}

export default router;
