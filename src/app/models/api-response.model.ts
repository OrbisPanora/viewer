import { ChunkData } from './chunk-data.model';

export interface ApiResponse<T> {
  status: 'success' | 'error'; // Mieux de typer explicitement les valeurs possibles
  data: T;
  error: any | null;
  timestamp: string; // Ou Date si vous la transformez
}