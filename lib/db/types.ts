export interface Chat {
  ROWID: number;
  guid: string;
  style: number;
  state: number;
  account_id: string;
  properties: Buffer | null;
  chat_identifier: string;
  service_name: string;
  room_name: string | null;
  account_login: string | null;
  is_archived: number;
  last_addressed_handle: string | null;
  display_name: string | null;
  group_id: string | null;
  is_filtered: number;
  successful_query: number;
  engram_id: string | null;
  server_change_token: string | null;
  ck_sync_state: number;
  original_group_id: string | null;
  last_read_message_timestamp: number;
  sr_server_change_token: string | null;
  sr_ck_sync_state: number;
  cloudkit_record_id: string | null;
  sr_cloudkit_record_id: string | null;
  last_addressed_sim_id: string | null;
  is_blackholed: number;
}

export interface Message {
  ROWID: number;
  guid: string;
  text: string | null;
  replace: number;
  service_center: string | null;
  handle_id: number | null;
  subject: string | null;
  country: string | null;
  attributedBody: Buffer | null;
  version: number;
  type: number;
  service: string | null;
  account: string | null;
  account_guid: string | null;
  error: number;
  date: number;
  date_read: number;
  date_delivered: number;
  is_delivered: number;
  is_finished: number;
  is_emote: number;
  is_from_me: number;
  is_empty: number;
  is_delayed: number;
  is_auto_reply: number;
  is_prepared: number;
  is_read: number;
  is_system_message: number;
  is_sent: number;
  has_dd_results: number;
  date_played: number;
  item_type: number;
  other_handle: number | null;
  group_title: string | null;
  group_action_type: number;
  share_status: number;
  share_direction: number;
  is_expirable: number;
  expire_state: number;
  message_action_type: number;
  message_source: number;
  associated_message_guid: string | null;
  associated_message_type: number;
  balloon_bundle_id: string | null;
  payload_data: Buffer | null;
  expressive_send_style_id: string | null;
  associated_message_range_location: number;
  associated_message_range_length: number;
  time_expressive_send_played: number;
  message_summary_info: Buffer | null;
  ck_sync_state: number;
  ck_record_id: string | null;
  ck_record_change_tag: string | null;
  destination_caller_id: string | null;
  sr_ck_sync_state: number;
  sr_ck_record_id: string | null;
  sr_ck_record_change_tag: string | null;
  is_corrupt: number;
  reply_to_guid: string | null;
  thread_originator_guid: string | null;
  thread_originator_part: string | null;
  was_downgraded: number;
  is_archive: number;
  cache_has_attachments: number;
  cache_roomnames: string | null;
  was_data_detected: number;
  was_deduplicated: number;
  is_audio_message: number;
  is_played: number;
}

export interface Handle {
  ROWID: number;
  id: string;
  country: string | null;
  service: string | null;
  uncanonicalized_id: string | null;
  person_centric_id: string | null;
}

export interface Attachment {
  ROWID: number;
  guid: string;
  created_date: number;
  start_date: number;
  filename: string | null;
  uti: string | null;
  mime_type: string | null;
  transfer_state: number;
  is_outgoing: number;
  user_info: Buffer | null;
  transfer_name: string | null;
  total_bytes: number;
  is_sticker: number;
  sticker_user_info: Buffer | null;
  attribution_info: Buffer | null;
  hide_attachment: number;
  ck_sync_state: number;
  ck_server_change_token_blob: Buffer | null;
  ck_record_id: string | null;
  original_guid: string | null;
  sr_ck_sync_state: number;
  sr_ck_server_change_token_blob: Buffer | null;
  sr_ck_record_id: string | null;
}

export interface ChatMessageJoin {
  chat_id: number;
  message_id: number;
}

export interface ChatHandleJoin {
  chat_id: number;
  handle_id: number;
}

export interface MessageAttachmentJoin {
  message_id: number;
  attachment_id: number;
}

export interface ConversationSummary {
  chat_id: number;
  chat_identifier: string;
  display_name: string | null;
  participants: string[];
  last_message: string | null;
  last_message_date: number | null;
  message_count: number;
  is_group: boolean;
}

export interface MessageWithAttachments {
  message: Message;
  handle: Handle | null;
  attachments: Attachment[];
  reactions?: Reaction[];
}

export type ReactionType =
  | "heart"
  | "thumbs_up"
  | "thumbs_down"
  | "laugh"
  | "emphasize"
  | "question";

export interface Reaction {
  ROWID: number;
  associated_message_type: number;
  handle_id: number | null;
  is_from_me: number;
  date: number;
  sender_id: string | null;
  reaction_type: ReactionType;
}

export interface DatabaseHealth {
  /** Every row in the message table, including reactions/stickers/edits. */
  totalMessages: number;
  /** Messages the viewer actually renders (excludes the 2000–3005 band). */
  displayableMessages: number;
  /** Messages with a populated plain-text `text` column. */
  withText: number;
  /** Empty `text` but a populated `attributedBody` — text recoverable by decode. */
  recoverableText: number;
  /** Empty `text` and no `attributedBody` — genuinely empty (usually attachments). */
  trueEmpty: number;
  /** Displayable-message count grouped by calendar year. */
  messagesByYear: Array<{ year: number; count: number }>;
  attachments: {
    total: number;
    withFilename: number;
    /** transfer_state distribution. 5 = downloaded/present, 0 = not downloaded. */
    byTransferState: Array<{ state: number; count: number }>;
    /** ck_sync_state distribution (CloudKit sync bookkeeping). */
    byCkSyncState: Array<{ state: number; count: number }>;
    /** Sampled filesystem presence check; null when no attachmentsPath given. */
    onDisk: {
      sampled: number;
      present: number;
      missing: number;
      presentRate: number;
      estimatedPresent: number;
      estimatedMissing: number;
    } | null;
  };
}
