// ** Notifications **
export enum ALARM_STATE {
    nominal = 'nominal',
    normal = 'normal',
    alert = 'alert',
    warn = 'warn',
    alarm = 'alarm',
    emergency = 'emergency'
}

export enum ALARM_METHOD {
    visual = 'visual', 
    sound = 'sound'
}

// ** Server Messages **
export interface DeltaMessage {
    path: string; 
    value: any;
}

export interface DeltaUpdate {
    updates: [{
        values: Array<DeltaMessage>
    }]
}

export interface DeltaNotification extends DeltaMessage {
    value: {
        state: ALARM_STATE,
        method: Array<ALARM_METHOD>,
        message: string
    }
}
