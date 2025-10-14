const { supabase } = require('../config/supabase');

const setupSocketHandlers = (io) => {
  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('join-room', async (data) => {
      const { userId, roomId } = data;
      socket.join(roomId);
      
      await supabase
        .from('room_users')
        .upsert({
          user_id: userId,
          is_online: true,
          last_activity: new Date().toISOString(),
          connection_id: socket.id
        });

      socket.to(roomId).emit('user-joined', { userId, socketId: socket.id });
    });

    socket.on('player-move', async (data) => {
      const { userId, x, y, direction } = data;
      
      await supabase
        .from('room_users')
        .update({
          x,
          y,
          direction,
          last_activity: new Date().toISOString()
        })
        .eq('user_id', userId);

      socket.broadcast.emit('player-moved', {
        userId,
        x,
        y,
        direction
      });
    });

    socket.on('send-message', async (data) => {
      const { userId, content, username, roomId } = data;
      
      const { data: message, error } = await supabase
        .from('room_messages')
        .insert([
          {
            user_id: userId,
            content,
            username,
            room_id: roomId
          }
        ])
        .select()
        .single();

      if (!error) {
        io.to(roomId).emit('new-message', message);
      }
    });

    socket.on('disconnect', async () => {
      console.log('User disconnected:', socket.id);
      
      await supabase
        .from('room_users')
        .update({
          is_online: false,
          last_activity: new Date().toISOString()
        })
        .eq('connection_id', socket.id);
    });
  });
};

module.exports = { setupSocketHandlers };