create index operations_formation on private.player_operations(formation_id);
create index numbers_formation_board on private.team_numbers(formation_id,board_id);
create index numbers_board on private.team_numbers(board_id);
create index players_formation_board on public.players(formation_id,board_id);
