import { Socket } from 'socket.io';
import { SocketData } from './socket-data.interface';

export type AuthenticatedSocket = Socket<any, any, any, SocketData>;
