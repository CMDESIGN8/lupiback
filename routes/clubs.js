import express from "express";
import { Club } from "../models/club.js";
import { ClubMember } from "../models/clubMember.js";
import { ClubEvent } from "../models/clubEvent.js";

const router = express.Router();

/* ===============================
   CREAR NUEVO CLUB
   =============================== */
router.post("/", async (req, res) => {
  try {
    console.log('🎯 POST /clubs - Datos recibidos:', req.body);
    
    const { name, description, logo_url, is_public, user_id } = req.body;

    if (!name || !user_id) {
      console.log('❌ Datos faltantes:', { name, user_id });
      return res.status(400).json({ error: "Nombre y user_id son requeridos" });
    }

    console.log('✅ Datos válidos, creando club...');
    
    const club = await Club.create({
      name,
      description,
      logo_url,
      is_public: is_public !== false,
      created_by: user_id
    });

    console.log('✅ Club creado:', club);

    // El creador automáticamente se convierte en admin
    const character = await getCharacterByUserId(user_id);
    console.log('🔍 Personaje encontrado:', character);
    
    if (character) {
      await ClubMember.joinClub({
        club_id: club.id,
        character_id: character.id,
        role: 'admin'
      });
      console.log('✅ Usuario agregado como admin del club');
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

/* ===============================
   PROMOVER A ADMINISTRADOR (solo admin)
   =============================== */
router.post("/:clubId/promote-to-admin", async (req, res) => {
  try {
    const { clubId } = req.params;
    const { character_id, target_character_id } = req.body;

    if (!character_id || !target_character_id) {
      return res.status(400).json({ 
        error: "character_id y target_character_id son requeridos" 
      });
    }

    // Verificar que el usuario que promueve es admin
    const currentAdmin = await ClubMember.findByClubAndCharacter(clubId, character_id);
    if (!currentAdmin || currentAdmin.role !== 'admin') {
      return res.status(403).json({ 
        error: "Solo los administradores pueden promover miembros" 
      });
    }

    // Verificar que el objetivo existe en el club
    const targetMember = await ClubMember.findByClubAndCharacter(clubId, target_character_id);
    if (!targetMember) {
      return res.status(404).json({ 
        error: "El miembro no existe en este club" 
      });
    }

    // Promover a admin
    const updatedMember = await ClubMember.updateRole({
      club_id: clubId,
      character_id: target_character_id,
      new_role: 'admin'
    });

    res.json({
      success: true,
      member: updatedMember,
      message: `¡${targetMember.characters?.nickname || 'El miembro'} ahora es administrador!`
    });

  } catch (error) {
    console.error("❌ Error promoviendo a admin:", error);
    res.status(400).json({ error: error.message });
  }
});

/* ===============================
   DEGRADAR A MIEMBRO (solo admin)
   =============================== */
router.post("/:clubId/demote-to-member", async (req, res) => {
  try {
    const { clubId } = req.params;
    const { character_id, target_character_id } = req.body;

    if (!character_id || !target_character_id) {
      return res.status(400).json({ 
        error: "character_id y target_character_id son requeridos" 
      });
    }

    // Verificar permisos
    const currentAdmin = await ClubMember.findByClubAndCharacter(clubId, character_id);
    if (!currentAdmin || currentAdmin.role !== 'admin') {
      return res.status(403).json({ 
        error: "Solo los administradores pueden degradar miembros" 
      });
    }

    // Verificar que no sea el último admin
    const admins = await ClubMember.getAdmins(clubId);
    if (admins.length <= 1) {
      return res.status(400).json({ 
        error: "No puedes degradar al último administrador del club" 
      });
    }

    // Degradar a miembro
    const updatedMember = await ClubMember.updateRole({
      club_id: clubId,
      character_id: target_character_id,
      new_role: 'member'
    });

    res.json({
      success: true,
      member: updatedMember,
      message: `¡${targetMember.characters?.nickname || 'El administrador'} ahora es miembro regular!`
    });

  } catch (error) {
    console.error("❌ Error degradando a miembro:", error);
    res.status(400).json({ error: error.message });
  }
});

/* ===============================
   CREAR EVENTO EN CLUB (solo admin)
   =============================== */
router.post("/:clubId/events", async (req, res) => {
  try {
    const { clubId } = req.params;
    const { 
      title, description, event_type, start_date, end_date, 
      max_participants, location, price, reward_lupicoins, character_id 
    } = req.body;

    if (!title || !start_date || !character_id) {
      return res.status(400).json({ 
        error: "Título, fecha de inicio y character_id son requeridos" 
      });
    }

    const member = await ClubMember.findByClubAndCharacter(clubId, character_id);
    if (!member || member.role !== 'admin') {
      return res.status(403).json({ 
        error: "Solo los administradores pueden crear eventos" 
      });
    }

    const event = await ClubEvent.create({
      club_id: clubId,
      title,
      description,
      event_type: event_type || 'training',
      start_date,
      end_date,
      max_participants,
      location,
      price: price || 0,
      reward_lupicoins: reward_lupicoins || 0,
      created_by: character_id
    });

    res.status(201).json({
      success: true,
      event,
      message: `Evento "${title}" creado exitosamente`
    });

  } catch (error) {
    console.error("❌ Error creando evento:", error);
    res.status(400).json({ error: error.message });
  }
});

/* ===============================
   LISTAR EVENTOS DEL CLUB
   =============================== */
router.get("/:clubId/events", async (req, res) => {
  try {
    const { clubId } = req.params;
    const events = await ClubEvent.findByClubId(clubId);

    res.json({
      success: true,
      events: events || []
    });

  } catch (error) {
    console.error("❌ Error obteniendo eventos:", error);
    res.status(500).json({ error: error.message });
  }
});

/* ===============================
   UNIRSE A EVENTO
   =============================== */
router.post("/:clubId/events/:eventId/join", async (req, res) => {
  try {
    const { clubId, eventId } = req.params;
    const { character_id } = req.body;

    if (!character_id) {
      return res.status(400).json({ error: "character_id es requerido" });
    }

    const member = await ClubMember.findByClubAndCharacter(clubId, character_id);
    if (!member) {
      return res.status(403).json({ 
        error: "Debes ser miembro del club para unirte a eventos" 
      });
    }

    const event = await ClubEvent.findById(eventId);
    if (!event) {
      return res.status(404).json({ error: "Evento no encontrado" });
    }

    if (event.status !== 'scheduled' && event.status !== 'active') {
      return res.status(400).json({ error: "Este evento no acepta participantes" });
    }

    if (event.max_participants) {
      const currentParticipants = await ClubEvent.getParticipantCount(eventId);
      if (currentParticipants >= event.max_participants) {
        return res.status(400).json({ error: "Evento lleno" });
      }
    }

    const { data, error } = await supabase
      .from('club_event_participants')
      .insert([{ event_id: eventId, character_id: character_id }])
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      participation: data,
      message: "¡Te has unido al evento!"
    });

  } catch (error) {
    console.error("❌ Error uniéndose al evento:", error);
    res.status(400).json({ error: error.message });
  }
});

/* ===============================
   ACTUALIZAR EVENTO (solo admin)
   =============================== */
router.patch("/:clubId/events/:eventId", async (req, res) => {
  try {
    const { clubId, eventId } = req.params;
    const { character_id, ...updates } = req.body;

    // Verificar permisos de admin
    const member = await ClubMember.findByClubAndCharacter(clubId, character_id);
    if (!member || member.role !== 'admin') {
      return res.status(403).json({ 
        error: "Solo los administradores pueden actualizar eventos" 
      });
    }

    const updatedEvent = await ClubEvent.update(eventId, updates);

    res.json({
      success: true,
      event: updatedEvent,
      message: "Evento actualizado exitosamente"
    });

  } catch (error) {
    console.error("❌ Error actualizando evento:", error);
    res.status(400).json({ error: error.message });
  }
});

/* ===============================
   ELIMINAR EVENTO (solo admin)
   =============================== */
router.delete("/:clubId/events/:eventId", async (req, res) => {
  try {
    const { clubId, eventId } = req.params;
    const { character_id } = req.body;

    // Verificar permisos de admin
    const member = await ClubMember.findByClubAndCharacter(clubId, character_id);
    if (!member || member.role !== 'admin') {
      return res.status(403).json({ 
        error: "Solo los administradores pueden eliminar eventos" 
      });
    }

    await ClubEvent.delete(eventId);

    res.json({
      success: true,
      message: "Evento eliminado exitosamente"
    });

  } catch (error) {
    console.error("❌ Error eliminando evento:", error);
    res.status(400).json({ error: error.message });
  }
});

// Helper function
// Función auxiliar mejorada
async function getCharacterByUserId(userId) {
  try {
    console.log('🔍 Buscando personaje para user_id:', userId);
    
    const { data, error } = await supabase
      .from('characters')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error) {
      console.error('❌ Error buscando personaje:', error);
      return null;
    }

    console.log('✅ Personaje encontrado:', data);
    return data;
  } catch (error) {
    console.error('❌ Error en getCharacterByUserId:', error);
    return null;
  }
}

export default router;


