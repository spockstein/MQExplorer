/**
 * TypeScript declarations for optional IBM MQ dependency
 * This allows the code to compile even when IBM MQ libraries are not available
 */

declare module 'ibmmq' {
  export interface MQCNO {
    Options: number;
    ClientConn: MQCD;
    SecurityParms?: MQCSP;
  }

  export interface MQCD {
    ConnectionName: string;
    ChannelName: string;
  }

  export interface MQCSP {
    UserId: string;
    Password: string;
  }

  export interface MQOD {
    ObjectName: string;
    ObjectType: number;
  }

  export interface MQMD {
    Format: string;
    MsgId: Buffer;
    CorrelId: Buffer;
    PutDate: string;
    PutTime: string;
    Priority: number;
    Persistence: number;
    Expiry: number;
    ReplyToQ: string;
    ReplyToQMgr: string;
  }

  export interface MQPMO {
    Options: number;
  }

  export interface MQGMO {
    Options: number;
    WaitInterval: number;
  }

  export interface MQObject {
    // Object handle for queue operations
  }

  export interface MQQueueManager {
    // Queue manager handle
  }

  export interface MQAttr {
    selector: number;
    value: any;
  }

  export namespace MQC {
    // Connection options
    export const MQCNO_CLIENT_BINDING: number;

    // Object types
    export const MQOT_Q: number;

    // Open options
    export const MQOO_INPUT_AS_Q_DEF: number;
    export const MQOO_OUTPUT: number;
    export const MQOO_BROWSE: number;
    export const MQOO_FAIL_IF_QUIESCING: number;

    // Get message options
    export const MQGMO_BROWSE_FIRST: number;
    export const MQGMO_BROWSE_NEXT: number;
    export const MQGMO_NO_WAIT: number;
    export const MQGMO_WAIT: number;
    export const MQGMO_ACCEPT_TRUNCATED_MSG: number;

    // Put message options
    export const MQPMO_NEW_MSG_ID: number;
    export const MQPMO_NEW_CORREL_ID: number;

    // Queue types
    export const MQQT_ALL: number;
    export const MQQT_LOCAL: number;

    // Selectors for PCF commands
    export const MQCA_Q_NAME: number;
    export const MQIA_CURRENT_Q_DEPTH: number;
    export const MQIA_Q_TYPE: number;
    export const MQCA_Q_DESC: number;
    export const MQIACF_Q_ATTRS: number;

    // PCF Commands
    export const MQCMD_INQUIRE_Q: number;
    export const MQCMD_INQUIRE_Q_NAMES: number;

    // Return codes
    export const MQRC_NO_MSG_AVAILABLE: number;
    export const MQRC_NOT_AUTHORIZED: number;
  }

  // Function signatures
  export function Connx(qmgrName: string, connOpts: MQCNO, callback: (err: any, qmgr: MQQueueManager) => void): void;
  export function Disc(qmgr: MQQueueManager, callback: (err: any) => void): void;
  export function Open(qmgr: MQQueueManager, od: MQOD, openOpts: number, callback: (err: any, obj: MQObject) => void): void;
  export function Close(obj: MQObject, closeOpts: number, callback: (err: any) => void): void;
  export function Put(obj: MQObject, md: MQMD, pmo: MQPMO, buffer: Buffer, callback: (err: any) => void): void;
  export function Get(obj: MQObject, md: MQMD, gmo: MQGMO, buffer: Buffer, callback: (err: any, len: number) => void): void;
  export function Inq(qmgr: MQQueueManager, selectors: MQAttr[], callback: (err: any, result: any) => void): void;
}

// Global namespace declaration to handle mq.* references in IBMMQProvider
declare namespace mq {
  namespace MQC {
    const MQOT_Q: number;
    const MQOO_INPUT_AS_Q_DEF: number;
    const MQOO_INPUT_SHARED: number;
    const MQOO_INPUT_EXCLUSIVE: number;
    const MQOO_OUTPUT: number;
    const MQOO_BROWSE: number;
    const MQOO_INQUIRE: number;
    const MQOO_FAIL_IF_QUIESCING: number;
    const MQGMO_BROWSE_FIRST: number;
    const MQGMO_BROWSE_NEXT: number;
    const MQGMO_NO_WAIT: number;
    const MQGMO_WAIT: number;
    const MQGMO_NO_SYNCPOINT: number;
    const MQGMO_FAIL_IF_QUIESCING: number;
    const MQGMO_ACCEPT_TRUNCATED_MSG: number;
    const MQGMO_CONVERT: number;
    const MQPMO_NEW_MSG_ID: number;
    const MQPMO_NEW_CORREL_ID: number;
    const MQPMO_SYNCPOINT: number;
    const MQPMO_NO_SYNCPOINT: number;
    const MQPMO_FAIL_IF_QUIESCING: number;
    const MQRC_NO_MSG_AVAILABLE: number;
    const MQRC_UNKNOWN_OBJECT_NAME: number;
    const MQIA_CURRENT_Q_DEPTH: number;
    const MQIA_Q_TYPE: number;
    const MQQT_ALL: number;
    const MQCA_Q_NAME: number;
    const MQCA_Q_DESC: number;
    const MQIACF_Q_ATTRS: number;
    const MQCMD_INQUIRE_Q: number;
    const MQCFC_LAST: number;
    const MQFMT_ADMIN: number;
    const MQFMT_STRING: number;
    const MQMT_REQUEST: number;
    const MQPER_NOT_PERSISTENT: number;
    const MQPER_PERSISTENT: number;
    const MQIA_MAX_Q_DEPTH: number;
    const MQIA_OPEN_INPUT_COUNT: number;
    const MQIA_OPEN_OUTPUT_COUNT: number;
  }
  class MQMD { }
  class MQPMO { }
  class MQGMO { }
  class MQOD { }
  class MQCNO { }
  class MQCD { }
  class MQCSP { }
  class MQAttr { }
  class MQObject { }
  function Connx(...args: any[]): any;
  function Disc(...args: any[]): any;
  function Open(...args: any[]): any;
  function Close(...args: any[]): any;
  function Put(...args: any[]): any;
  function Get(...args: any[]): any;
  function GetSync(...args: any[]): any;
  function Inq(...args: any[]): any;
  function Cmit(...args: any[]): any;
  function Back(...args: any[]): any;
}
