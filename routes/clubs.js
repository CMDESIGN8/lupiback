import express from "express";
import { Club } from "../models/club.js";
import { ClubMember } from "../models/clubMember.js";

const router = express.Router();

/* ===============================
   CREAR NUEVO CLUB
   =============================== */
router.post("/", async (req, res) => {
  try {
    const { name, description, logo_url, is_public, user_id } = req.body;

    if (!name || !user_id) {
      return res.status(400).json({ error: "Nombre y user_id son requeridos" });
    }

    const club = await Club.create({
      name,
      description,
      logo_url,
      is_public: is_public !== false,
      created_by: user_id
    });

    // El creador automáticamente se convierte en admin
    const character = await getCharacterByUserId(user_id);
    if (character) {
      await ClubMember.joinClub({
        club_id: club.id,
        character_id: character.id,
        role: 'admin'
      });
    }

    res.status(201).json({
      success: true,
      club,
      message: `¡Club ${name} creado exitosamente!`
    });

  } catch (error) {
    console.error("❌ Error creando club:", error);
    res.status(400).json({ error: error.message });
  }
});

/* ===============================
   LISTAR CLUBES (con paginación)
   =============================== */
router.get("/", async (req, res) => {
  try {
    const { page = 1, limit = 20, search = '' } = req.query;

    const result = await Club.findAll({
      page: parseInt(page),
      limit: parseInt(limit),
      search
    });

    res.json({
      success: true,
      clubs: result.clubs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: result.total,
        totalPages: Math.ceil(result.total / limit)
      }
    });

  } catch (error) {
    console.error("❌ Error listando clubes:", error);
    res.status(500).json({ error: error.message });
  }
});

/* ===============================
   OBTENER CLUB ESPECÍFICO
   =============================== */
router.get("/:clubId", async (req, res) => {
  try {
    const { clubId } = req.params;

    const club = await Club.findById(clubId);
    if (!club) {
      return res.status(404).json({ error: "Club no encontrado" });
    }

    res.json({
      success: true,
      club
    });

  } catch (error) {
    console.error("❌ Error obteniendo club:", error);
    res.status(500).json({ error: error.message });
  }
});

/* ===============================
   UNIRSE A CLUB
   =============================== */
router.post("/:clubId/join", async (req, res) => {
  try {
    const { clubId } = req.params;
    const { character_id } = req.body;

    if (!character_id) {
      return res.status(400).json({ error: "character_id es requerido" });
    }

    const member = await ClubMember.joinClub({
      club_id: clubId,
      character_id
    });

    res.json({
      success: true,
      member,
      message: "¡Te has unido al club exitosamente!"
    });

  } catch (error) {
    console.error("❌ Error uniéndose al club:", error);
    res.status(400).json({ error: error.message });
  }
});

/* ===============================
   ABANDONAR CLUB
   =============================== */
router.post("/:clubId/leave", async (req, res) => {
  try {
    const { clubId } = req.params;
    const { character_id } = req.body;

    if (!character_id) {
      return res.status(400).json({ error: "character_id es requerido" });
    }

    await ClubMember.leaveClub({
      club_id: clubId,
      character_id
    });

    res.json({
      success: true,
      message: "Has abandonado el club"
    });

  } catch (error) {
    console.error("❌ Error abandonando club:", error);
    res.status(400).json({ error: error.message });
  }
});

/* ===============================
   OBTENER MIEMBROS DEL CLUB
   =============================== */
router.get("/:clubId/members", async (req, res) => {
  try {
    const { clubId } = req.params;

    const members = await ClubMember.getMembers(clubId);

    res.json({
      success: true,
      members
    });

  } catch (error) {
    console.error("❌ Error obteniendo miembros:", error);
    res.status(500).json({ error: error.message });
  }
});

/* ===============================
   RANKING SEMANAL DEL CLUB
   =============================== */
router.get("/:clubId/ranking", async (req, res) => {
  try {
    const { clubId } = req.params;

    const ranking = await ClubMember.getWeeklyRanking(clubId);

    res.json({
      success: true,
      ranking,
      updated_at: new Date()
    });

  } catch (error) {
    console.error("❌ Error obteniendo ranking:", error);
    res.status(500).json({ error: error.message });
  }
});

/* ===============================
   ACTUALIZAR ROL DE MIEMBRO (solo admin)
   =============================== */
router.patch("/:clubId/members/:characterId/role", async (req, res) => {
  try {
    const { clubId, characterId } = req.params;
    const { new_role } = req.body;

    if (!new_role || !['admin', 'moderator', 'member'].includes(new_role)) {
      return res.status(400).json({ error: "Rol inválido" });
    }

    const updatedMember = await ClubMember.updateRole({
      club_id: clubId,
      character_id: characterId,
      new_role
    });

    res.json({
      success: true,
      member: updatedMember,
      message: `Rol actualizado a ${new_role}`
    });

  } catch (error) {
    console.error("❌ Error actualizando rol:", error);
    res.status(400).json({ error: error.message });
  }
});

// Helper function
async function getCharacterByUserId(userId) {
  const { data, error } = await supabase
    .from('characters')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error) return null;
  return data;
}

export default router;
