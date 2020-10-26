import { ServerRoles } from '../server/api';
import { DeltaMessage } from '../server/delta';

export interface StreamHello {
    version: string;
    roles: Array<ServerRoles>;
    name?: string;
    timestamp?: string;
    self?: string;
    startTime?: string;
    playbackRate?: number;
}

export interface StreamUpdate {
    context: string;
    source?: {
        label?: string;
        type?: string;
        src?: string;
        pgn?: number;
    }
    updates: [{
        values: Array<DeltaMessage>
    }]
    timestamp: string;
    $source: string;
}
