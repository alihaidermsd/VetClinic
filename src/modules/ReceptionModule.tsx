import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Plus, UserPlus, ClipboardList } from 'lucide-react';
import { createPatient, searchPatients } from '@/lib/services/patientService';
import { createToken, getTodayTokens } from '@/lib/services/tokenService';
import { getAllRooms } from '@/lib/services/roomService';
import type { PatientFormData, AnimalType, Animal, Token } from '@/types';
import { toast } from 'sonner';

const ANIMAL_TYPES: { value: AnimalType; label: string }[] = [
  { value: 'dog', label: 'Dog' },
  { value: 'cat', label: 'Cat' },
  { value: 'cow', label: 'Cow' },
  { value: 'goat', label: 'Goat' },
  { value: 'bird', label: 'Bird' },
  { value: 'other', label: 'Other' },
];

export function ReceptionModule() {
  const [activeTab, setActiveTab] = useState('new');
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [todayTokens, setTodayTokens] = useState<Token[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<any>(null);
  const [isSearching, setIsSearching] = useState(false);

  // Form state
  const [formData, setFormData] = useState<PatientFormData>({
    owner_name: '',
    owner_phone: '',
    owner_email: '',
    owner_address: '',
    animal_name: '',
    animal_type: 'dog',
    breed: '',
    age: undefined,
    age_unit: 'years',
    gender: 'unknown',
    weight: undefined,
    notes: '',
  });

  useEffect(() => {
    loadTodayTokens();
    loadRooms();
  }, []);

  const loadTodayTokens = () => {
    const tokens = getTodayTokens();
    setTodayTokens(tokens);
  };

  const loadRooms = () => {
    getAllRooms();
  };

  const handleSearch = () => {
    if (!searchTerm.trim()) return;
    setIsSearching(true);
    const results = searchPatients(searchTerm);
    setSearchResults(results);
    setIsSearching(false);
  };

  const handleCreatePatient = () => {
    try {
      if (!formData.owner_name || !formData.owner_phone || !formData.animal_name) {
        toast.error('Please fill in all required fields');
        return;
      }

      const { patient, animal } = createPatient(formData);
      toast.success('Patient registered successfully');
      
      // Generate token
      const token = createToken(patient.id, animal.id);
      toast.success(`Token #${token.token_number} generated`);
      
      // Reset form and refresh
      setFormData({
        owner_name: '',
        owner_phone: '',
        owner_email: '',
        owner_address: '',
        animal_name: '',
        animal_type: 'dog',
        breed: '',
        age: undefined,
        age_unit: 'years',
        gender: 'unknown',
        weight: undefined,
        notes: '',
      });
      
      loadTodayTokens();
    } catch (error) {
      toast.error('Failed to register patient');
      console.error(error);
    }
  };

  const handleSelectPatient = (result: any) => {
    setSelectedPatient(result);
    setSearchResults([]);
    setSearchTerm('');
  };

  const handleGenerateTokenForExisting = (patientId: number, animalId: number) => {
    try {
      const token = createToken(patientId, animalId);
      toast.success(`Token #${token.token_number} generated`);
      loadTodayTokens();
      setSelectedPatient(null);
    } catch (error) {
      toast.error('Failed to generate token');
      console.error(error);
    }
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      waiting: 'bg-yellow-100 text-yellow-800',
      in_progress: 'bg-blue-100 text-blue-800',
      completed: 'bg-green-100 text-green-800',
      cancelled: 'bg-red-100 text-red-800',
    };
    return styles[status] || 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="new">New Patient</TabsTrigger>
          <TabsTrigger value="search">Search Patient</TabsTrigger>
          <TabsTrigger value="tokens">Today's Tokens</TabsTrigger>
        </TabsList>

        {/* New Patient Tab */}
        <TabsContent value="new" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserPlus className="w-5 h-5" />
                Register New Patient
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Owner Information */}
              <div className="space-y-4">
                <h3 className="font-medium text-slate-900 border-b pb-2">Owner Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="owner_name">Owner Name *</Label>
                    <Input
                      id="owner_name"
                      value={formData.owner_name}
                      onChange={(e) => setFormData({ ...formData, owner_name: e.target.value })}
                      placeholder="Enter owner name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="owner_phone">Phone Number *</Label>
                    <Input
                      id="owner_phone"
                      value={formData.owner_phone}
                      onChange={(e) => setFormData({ ...formData, owner_phone: e.target.value })}
                      placeholder="Enter phone number"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="owner_email">Email</Label>
                    <Input
                      id="owner_email"
                      type="email"
                      value={formData.owner_email}
                      onChange={(e) => setFormData({ ...formData, owner_email: e.target.value })}
                      placeholder="Enter email address"
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="owner_address">Address</Label>
                    <Input
                      id="owner_address"
                      value={formData.owner_address}
                      onChange={(e) => setFormData({ ...formData, owner_address: e.target.value })}
                      placeholder="Enter address"
                    />
                  </div>
                </div>
              </div>

              {/* Animal Information */}
              <div className="space-y-4">
                <h3 className="font-medium text-slate-900 border-b pb-2">Animal Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="animal_name">Animal Name *</Label>
                    <Input
                      id="animal_name"
                      value={formData.animal_name}
                      onChange={(e) => setFormData({ ...formData, animal_name: e.target.value })}
                      placeholder="Enter animal name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="animal_type">Animal Type *</Label>
                    <Select
                      value={formData.animal_type}
                      onValueChange={(value: AnimalType) => setFormData({ ...formData, animal_type: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        {ANIMAL_TYPES.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="breed">Breed</Label>
                    <Input
                      id="breed"
                      value={formData.breed}
                      onChange={(e) => setFormData({ ...formData, breed: e.target.value })}
                      placeholder="Enter breed"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="gender">Gender</Label>
                    <Select
                      value={formData.gender}
                      onValueChange={(value: 'male' | 'female' | 'unknown') => 
                        setFormData({ ...formData, gender: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select gender" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="male">Male</SelectItem>
                        <SelectItem value="female">Female</SelectItem>
                        <SelectItem value="unknown">Unknown</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="age">Age</Label>
                    <div className="flex gap-2">
                      <Input
                        id="age"
                        type="number"
                        value={formData.age || ''}
                        onChange={(e) => setFormData({ ...formData, age: parseFloat(e.target.value) })}
                        placeholder="Age"
                        className="flex-1"
                      />
                      <Select
                        value={formData.age_unit}
                        onValueChange={(value: 'months' | 'years') => 
                          setFormData({ ...formData, age_unit: value })
                        }
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="months">Months</SelectItem>
                          <SelectItem value="years">Years</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="weight">Weight (kg)</Label>
                    <Input
                      id="weight"
                      type="number"
                      step="0.1"
                      value={formData.weight || ''}
                      onChange={(e) => setFormData({ ...formData, weight: parseFloat(e.target.value) })}
                      placeholder="Enter weight"
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="notes">Notes</Label>
                    <Input
                      id="notes"
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      placeholder="Any additional notes"
                    />
                  </div>
                </div>
              </div>

              <Button onClick={handleCreatePatient} className="w-full">
                <Plus className="w-4 h-4 mr-2" />
                Register Patient & Generate Token
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Search Patient Tab */}
        <TabsContent value="search" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Search className="w-5 h-5" />
                Search Patient
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2 mb-4">
                <Input
                  placeholder="Search by owner name or phone..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                  className="flex-1"
                />
                <Button onClick={handleSearch} disabled={isSearching}>
                  <Search className="w-4 h-4 mr-2" />
                  Search
                </Button>
              </div>

              {searchResults.length > 0 && (
                <div className="space-y-2">
                  <h3 className="font-medium text-slate-900">Search Results</h3>
                  {searchResults.map((result) => (
                    <Card key={result.patient.id} className="cursor-pointer hover:bg-slate-50" 
                          onClick={() => handleSelectPatient(result)}>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">{result.patient.owner_name}</p>
                            <p className="text-sm text-slate-500">{result.patient.owner_phone}</p>
                            {result.animals.length > 0 && (
                              <p className="text-sm text-slate-600 mt-1">
                                Pets: {result.animals.map((a: Animal) => a.name).join(', ')}
                              </p>
                            )}
                          </div>
                          <Button size="sm" variant="outline">
                            Select
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {selectedPatient && (
                <Dialog open={!!selectedPatient} onOpenChange={() => setSelectedPatient(null)}>
                  <DialogContent className="max-w-lg">
                    <DialogHeader>
                      <DialogTitle>Patient Details</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <p className="font-medium">{selectedPatient.patient.owner_name}</p>
                        <p className="text-sm text-slate-500">{selectedPatient.patient.owner_phone}</p>
                      </div>
                      
                      <div className="space-y-2">
                        <h4 className="font-medium">Animals</h4>
                        {selectedPatient.animals.map((animal: Animal) => (
                          <div key={animal.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                            <div>
                              <p className="font-medium">{animal.name}</p>
                              <p className="text-sm text-slate-500">{animal.type} {animal.breed && `- ${animal.breed}`}</p>
                            </div>
                            <Button 
                              size="sm" 
                              onClick={() => handleGenerateTokenForExisting(selectedPatient.patient.id, animal.id)}
                            >
                              <Plus className="w-4 h-4 mr-1" />
                              New Token
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Today's Tokens Tab */}
        <TabsContent value="tokens" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <ClipboardList className="w-5 h-5" />
                Today's Tokens
              </CardTitle>
              <Button variant="outline" size="sm" onClick={loadTodayTokens}>
                Refresh
              </Button>
            </CardHeader>
            <CardContent>
              {todayTokens.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-200">
                        <th className="text-left py-2 text-sm font-medium text-slate-500">Token #</th>
                        <th className="text-left py-2 text-sm font-medium text-slate-500">Bill Code</th>
                        <th className="text-left py-2 text-sm font-medium text-slate-500">Status</th>
                        <th className="text-left py-2 text-sm font-medium text-slate-500">Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {todayTokens.map((token) => (
                        <tr key={token.id} className="border-b border-slate-100">
                          <td className="py-3 font-medium">#{token.token_number}</td>
                          <td className="py-3 text-sm">-</td>
                          <td className="py-3">
                            <Badge className={getStatusBadge(token.status)}>
                              {token.status}
                            </Badge>
                          </td>
                          <td className="py-3 text-sm text-slate-500">
                            {new Date(token.created_at).toLocaleTimeString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-8 text-slate-500">
                  <ClipboardList className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>No tokens generated today</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
