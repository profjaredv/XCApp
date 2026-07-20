import React, { useEffect, useState } from 'react';
import { axiosInstance } from '@/api/axios';
import { auth } from '@/firebase';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDateShort } from '@/lib/formatUtils';

interface Athlete {
    _id: string;
    name: string;
    graduationYear: number;
    gender: string;
    grade: number;
}

interface Race {
    _id: string;
    name: string;
    date: string;
    distance: string;
    season: string;
}

interface Result {
    _id: string;
    athlete: Athlete;
    race: Race;
    time: number;
    grade: number;
}

const formatTime = (timeInSeconds: number | null): string => {
  if (timeInSeconds === null || isNaN(timeInSeconds)) return '-';
  const minutes = Math.floor(timeInSeconds / 60);
  const seconds = (timeInSeconds % 60).toFixed(1);
  return `${minutes}:${seconds.padStart(4, '0')}`;
};

const ResultsPage: React.FC = () => {
    const [results, setResults] = useState<Result[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const fetchResults = async () => {
            try {
                const token = await auth.currentUser?.getIdToken();
                const response = await axiosInstance.get('/results', {
                    headers: { Authorization: `Bearer ${token}` },
                });
                setResults(response.data);
            } catch {
                setError('Failed to fetch results.');
            } finally {
                setLoading(false);
            }
        };

        fetchResults();
    }, []);

    if (loading) {
        return <div>Loading...</div>;
    }

    if (error) {
        return <div className="text-red-600">{error}</div>;
    }

    return (
        <div className="space-y-4">
            <h1 className="text-3xl font-bold">Race Results</h1>
            <Card>
                <CardHeader>
                    <CardTitle>All Imported Results</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Date</TableHead>
                                <TableHead>Race</TableHead>
                                <TableHead>Athlete</TableHead>
                                <TableHead>Grade</TableHead>
                                <TableHead>Gender</TableHead>
                                <TableHead>Time</TableHead>
                                <TableHead>Distance</TableHead>
                                <TableHead>Season</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {results.length > 0 ? (
                                results.map((result) => (
                                    <TableRow key={result._id}>
                                        <TableCell>{formatDateShort(result.race.date)}</TableCell>
                                        <TableCell>{result.race.name}</TableCell>
                                        <TableCell>{result.athlete.name}</TableCell>
                                        <TableCell>{result.grade || '-'}</TableCell>
                                        <TableCell>{result.athlete.gender}</TableCell>
                                        <TableCell>{formatTime(result.time)}</TableCell>
                                        <TableCell>{result.race.distance}</TableCell>
                                        <TableCell>{result.race.season}</TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                                                        <TableCell colSpan={8} className="text-center">
                                        No results found. Try importing a season.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
};

export default ResultsPage;
