const { supabase } = require('../config/supabase');

const getAvatars = async (req, res) => {
  try {
    const userId = req.user?.id;

    const { data: avatars, error } = await supabase
      .from('avatars')
      .select('*')
      .order('rarity', { ascending: false })
      .order('price', { ascending: true });

    if (error) throw error;

    if (userId) {
      const { data: userAvatars } = await supabase
        .from('player_avatars')
        .select('avatar_id, is_equipped')
        .eq('player_id', userId);

      const avatarsWithOwnership = avatars.map(avatar => ({
        ...avatar,
        owned: userAvatars?.some(ua => ua.avatar_id === avatar.id) || false,
        equipped: userAvatars?.some(ua => ua.avatar_id === avatar.id && ua.is_equipped) || false
      }));

      return res.json(avatarsWithOwnership);
    }

    res.json(avatars);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const purchaseAvatar = async (req, res) => {
  try {
    const userId = req.user.id;
    const { avatarId } = req.body;

    const { data: avatar, error: avatarError } = await supabase
      .from('avatars')
      .select('*')
      .eq('id', avatarId)
      .single();

    if (avatarError) throw avatarError;

    const { data: existingAvatar } = await supabase
      .from('player_avatars')
      .select('id')
      .eq('player_id', userId)
      .eq('avatar_id', avatarId)
      .single();

    if (existingAvatar) {
      return res.status(400).json({ error: 'Ya posees este avatar' });
    }

    const { data: player, error: playerError } = await supabase
      .from('players')
      .select('lupi_coins, level')
      .eq('id', userId)
      .single();

    if (playerError) throw playerError;

    if (player.lupi_coins < avatar.price) {
      return res.status(400).json({ error: 'LupiCoins insuficientes' });
    }

    if (player.level < avatar.required_level) {
      return res.status(400).json({ error: 'Nivel insuficiente para este avatar' });
    }

    await supabase
      .from('players')
      .update({
        lupi_coins: player.lupi_coins - avatar.price
      })
      .eq('id', userId);

    const { data: playerAvatar, error } = await supabase
      .from('player_avatars')
      .insert([
        {
          player_id: userId,
          avatar_id: avatarId,
          is_equipped: false,
          acquired_at: new Date().toISOString()
        }
      ])
      .select(`
        *,
        avatars (*)
      `)
      .single();

    if (error) throw error;

    res.json(playerAvatar);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const equipAvatar = async (req, res) => {
  try {
    const userId = req.user.id;
    const { avatarId } = req.body;

    await supabase
      .from('player_avatars')
      .update({ is_equipped: false })
      .eq('player_id', userId);

    const { data, error } = await supabase
      .from('player_avatars')
      .update({ is_equipped: true })
      .eq('player_id', userId)
      .eq('avatar_id', avatarId)
      .select(`
        *,
        avatars (*)
      `)
      .single();

    if (error) throw error;

    await supabase
      .from('room_users')
      .update({
        avatar_url: data.avatars.image_url
      })
      .eq('user_id', userId);

    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getUserAvatars = async (req, res) => {
  try {
    const userId = req.user.id;

    const { data: avatars, error } = await supabase
      .from('player_avatars')
      .select(`
        *,
        avatars (*)
      `)
      .eq('player_id', userId)
      .order('is_equipped', { ascending: false })
      .order('acquired_at', { ascending: false });

    if (error) throw error;

    res.json(avatars);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getShopItems = async (req, res) => {
  try {
    const { data: items, error } = await supabase
      .from('items')
      .select('*')
      .order('bonus_value', { ascending: false });

    if (error) throw error;

    res.json(items);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  getAvatars,
  purchaseAvatar,
  equipAvatar,
  getUserAvatars,
  getShopItems
};