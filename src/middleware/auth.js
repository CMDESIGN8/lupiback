const { supabase } = require('../config/supabase');

const authenticateUser = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'Token de autenticación requerido' });
    }

    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      return res.status(401).json({ error: 'Token inválido' });
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(500).json({ error: 'Error en autenticación' });
  }
};

const optionalAuth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (token) {
      const { data: { user } } = await supabase.auth.getUser(token);
      req.user = user;
    }
    
    next();
  } catch (error) {
    next();
  }
};

module.exports = {
  authenticateUser,
  optionalAuth
};