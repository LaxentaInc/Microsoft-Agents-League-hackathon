mod channel;
pub mod protocol;

pub use channel::*;
pub use protocol::{
    is_player_pipe_available, pipe_name_for_monitor, send_command, send_command_to_monitor,
    PlayerCommand, get_pipe_name,
};
