import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Search, 
  Stethoscope, 
  FileText, 
  Plus, 
  ArrowRight,
  User,
  PawPrint,
  ClipboardList
} from 'lucide-react';
import { getTokenByNumber, getTokenWithDetails, assignTokenToRoom, startToken, completeToken } from '@/lib/services/tokenService';
import { getBillWithDetails, addBillItem, getCommonServices } from '@/lib/services/billingService';
import { createMedicalRecord } from '@/lib/services/medicalService';
import { getAllRooms } from '@/lib/services/roomService';
import { useAuth } from '@/hooks/useAuth';
import type { BillItemFormData } from '@/types';
import { toast } from 'sonner';

const REFERRAL_ROOMS = [
  { value: 'lab', label: 'Laboratory' },
  { value: 'xray', label: 'X-Ray Room' },
  { value: 'surgery', label: 'Surgery Room' },
  { value: 'pharmacy', label: 'Pharmacy' },
];

export function DoctorModule() {
  const { user } = useAuth();
  const [tokenNumber, setTokenNumber] = useState('');
  const [currentToken, setCurrentToken] = useState<any>(null);
  const [currentBill, setCurrentBill] = useState<any>(null);
  const [rooms, setRooms] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState('examination');

  // Medical record form
  const [diagnosis, setDiagnosis] = useState('');
  const [symptoms, setSymptoms] = useState('');
  const [treatment, setTreatment] = useState('');
  const [notes, setNotes] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');

  // Billing form
  const [selectedService, setSelectedService] = useState('');
  const [customItemName, setCustomItemName] = useState('');
  const [customItemPrice, setCustomItemPrice] = useState('');
  const [itemQuantity, setItemQuantity] = useState('1');

  useEffect(() => {
    loadRooms();
  }, []);

  const loadRooms = () => {
    const allRooms = getAllRooms();
    setRooms(allRooms);
  };

  const handleSearchToken = () => {
    if (!tokenNumber.trim()) {
      toast.error('Please enter a token number');
      return;
    }

    const token = getTokenByNumber(parseInt(tokenNumber));
    if (!token) {
      toast.error('Token not found');
      return;
    }

    const tokenDetails = getTokenWithDetails(token.id);
    if (!tokenDetails) {
      toast.error('Failed to load token details');
      return;
    }

    setCurrentToken(tokenDetails);
    
    // Load bill details
    const billDetails = getBillWithDetails(token.bill_id);
    setCurrentBill(billDetails);

    // Start the token
    startToken(token.id);
    toast.success(`Token #${token.token_number} loaded`);
  };

  const handleAddCharge = (isCustom: boolean = false) => {
    if (!currentToken || !currentBill || !user) return;

    let itemData: BillItemFormData;

    if (isCustom) {
      if (!customItemName || !customItemPrice) {
        toast.error('Please enter item name and price');
        return;
      }
      itemData = {
        item_name: customItemName,
        item_type: 'procedure',
        quantity: parseInt(itemQuantity) || 1,
        unit_price: parseFloat(customItemPrice),
        notes: '',
      };
    } else {
      const services = getCommonServices();
      const service = services.find(s => s.name === selectedService);
      if (!service) {
        toast.error('Please select a service');
        return;
      }
      itemData = {
        item_name: service.name,
        item_type: service.type as any,
        quantity: parseInt(itemQuantity) || 1,
        unit_price: service.price,
        notes: '',
      };
    }

    try {
      const doctorRoom = rooms.find(r => r.type === 'doctor_room');
      addBillItem(
        currentBill.bill.id,
        itemData,
        doctorRoom?.id || 0,
        doctorRoom?.name || 'Doctor Room',
        user.id,
        user.name
      );

      // Refresh bill
      const updatedBill = getBillWithDetails(currentBill.bill.id);
      setCurrentBill(updatedBill);

      toast.success('Charge added successfully');
      
      // Reset form
      setSelectedService('');
      setCustomItemName('');
      setCustomItemPrice('');
      setItemQuantity('1');
    } catch (error) {
      toast.error('Failed to add charge');
      console.error(error);
    }
  };

  const handleSaveMedicalRecord = () => {
    if (!currentToken || !currentBill || !user) return;

    try {
      createMedicalRecord({
        bill_id: currentBill.bill.id,
        patient_id: currentToken.patient.id,
        animal_id: currentToken.animal.id,
        doctor_id: user.id,
        doctor_name: user.name,
        room_id: rooms.find(r => r.type === 'doctor_room')?.id || 0,
        diagnosis,
        symptoms,
        treatment,
        notes,
        follow_up_date: followUpDate,
      });

      toast.success('Medical record saved');
    } catch (error) {
      toast.error('Failed to save medical record');
      console.error(error);
    }
  };

  const handleRefer = (roomType: string) => {
    if (!currentToken) return;

    const targetRoom = rooms.find(r => r.type === roomType);
    if (!targetRoom) {
      toast.error('Target room not found');
      return;
    }

    assignTokenToRoom(currentToken.token.id, targetRoom.id);
    toast.success(`Patient referred to ${targetRoom.name}`);
    
    // Clear current token
    setCurrentToken(null);
    setCurrentBill(null);
    setTokenNumber('');
  };

  const handleComplete = () => {
    if (!currentToken) return;

    completeToken(currentToken.token.id);
    toast.success('Token completed');
    
    // Clear current token
    setCurrentToken(null);
    setCurrentBill(null);
    setTokenNumber('');
  };

  return (
    <div className="space-y-6">
      {/* Token Search */}
      {!currentToken && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="w-5 h-5" />
              Enter Token Number
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input
                placeholder="Enter token number..."
                value={tokenNumber}
                onChange={(e) => setTokenNumber(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearchToken()}
                className="flex-1"
              />
              <Button onClick={handleSearchToken}>
                <Search className="w-4 h-4 mr-2" />
                Load
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Patient Details */}
      {currentToken && (
        <>
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center">
                    <User className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <p className="font-semibold text-lg">{currentToken.patient?.owner_name}</p>
                    <p className="text-sm text-slate-600">{currentToken.patient?.owner_phone}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="font-semibold">Token #{currentToken.token.token_number}</p>
                    <p className="text-sm text-slate-600">Bill: {currentToken.bill?.bill_code}</p>
                  </div>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-blue-200 flex items-center gap-4">
                <PawPrint className="w-5 h-5 text-blue-600" />
                <div>
                  <p className="font-medium">{currentToken.animal?.name}</p>
                  <p className="text-sm text-slate-600">
                    {currentToken.animal?.type} {currentToken.animal?.breed && `- ${currentToken.animal.breed}`}
                    {currentToken.animal?.age && `, ${currentToken.animal.age} ${currentToken.animal.age_unit}`}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="examination">Examination</TabsTrigger>
              <TabsTrigger value="billing">Add Charges</TabsTrigger>
              <TabsTrigger value="referral">Referral</TabsTrigger>
            </TabsList>

            {/* Examination Tab */}
            <TabsContent value="examination" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Stethoscope className="w-5 h-5" />
                    Medical Examination
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="symptoms">Symptoms</Label>
                    <Textarea
                      id="symptoms"
                      value={symptoms}
                      onChange={(e) => setSymptoms(e.target.value)}
                      placeholder="Enter observed symptoms"
                      rows={3}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="diagnosis">Diagnosis</Label>
                    <Textarea
                      id="diagnosis"
                      value={diagnosis}
                      onChange={(e) => setDiagnosis(e.target.value)}
                      placeholder="Enter diagnosis"
                      rows={3}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="treatment">Treatment Plan</Label>
                    <Textarea
                      id="treatment"
                      value={treatment}
                      onChange={(e) => setTreatment(e.target.value)}
                      placeholder="Enter treatment plan"
                      rows={3}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="notes">Additional Notes</Label>
                    <Textarea
                      id="notes"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Any additional notes"
                      rows={2}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="followUp">Follow-up Date</Label>
                    <Input
                      id="followUp"
                      type="date"
                      value={followUpDate}
                      onChange={(e) => setFollowUpDate(e.target.value)}
                    />
                  </div>
                  <Button onClick={handleSaveMedicalRecord} className="w-full">
                    <FileText className="w-4 h-4 mr-2" />
                    Save Medical Record
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Billing Tab */}
            <TabsContent value="billing" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Plus className="w-5 h-5" />
                    Add Charges
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Quick Services */}
                  <div className="space-y-2">
                    <Label>Quick Services</Label>
                    <div className="flex gap-2">
                      <Select value={selectedService} onValueChange={setSelectedService}>
                        <SelectTrigger className="flex-1">
                          <SelectValue placeholder="Select service" />
                        </SelectTrigger>
                        <SelectContent>
                          {getCommonServices().map((service) => (
                            <SelectItem key={service.name} value={service.name}>
                              {service.name} - ₹{service.price}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        type="number"
                        placeholder="Qty"
                        value={itemQuantity}
                        onChange={(e) => setItemQuantity(e.target.value)}
                        className="w-20"
                      />
                      <Button onClick={() => handleAddCharge(false)}>
                        Add
                      </Button>
                    </div>
                  </div>

                  {/* Custom Charge */}
                  <div className="space-y-2">
                    <Label>Custom Charge</Label>
                    <div className="flex gap-2">
                      <Input
                        placeholder="Item name"
                        value={customItemName}
                        onChange={(e) => setCustomItemName(e.target.value)}
                        className="flex-1"
                      />
                      <Input
                        type="number"
                        placeholder="Price"
                        value={customItemPrice}
                        onChange={(e) => setCustomItemPrice(e.target.value)}
                        className="w-28"
                      />
                      <Input
                        type="number"
                        placeholder="Qty"
                        value={itemQuantity}
                        onChange={(e) => setItemQuantity(e.target.value)}
                        className="w-20"
                      />
                      <Button onClick={() => handleAddCharge(true)}>
                        Add
                      </Button>
                    </div>
                  </div>

                  {/* Current Bill Items */}
                  {currentBill?.items && currentBill.items.length > 0 && (
                    <div className="mt-6">
                      <h4 className="font-medium mb-2">Current Bill Items</h4>
                      <div className="bg-slate-50 rounded-lg p-4">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b border-slate-200">
                              <th className="text-left py-1 text-sm">Item</th>
                              <th className="text-right py-1 text-sm">Qty</th>
                              <th className="text-right py-1 text-sm">Price</th>
                            </tr>
                          </thead>
                          <tbody>
                            {currentBill.items.map((item: any) => (
                              <tr key={item.id} className="border-b border-slate-100">
                                <td className="py-2 text-sm">{item.item_name}</td>
                                <td className="py-2 text-sm text-right">{item.quantity}</td>
                                <td className="py-2 text-sm text-right">₹{item.total_price}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="font-semibold">
                              <td className="py-2" colSpan={2}>Total</td>
                              <td className="py-2 text-right">₹{currentBill.bill.total_amount}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Referral Tab */}
            <TabsContent value="referral" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ArrowRight className="w-5 h-5" />
                    Refer Patient
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4">
                    {REFERRAL_ROOMS.map((room) => (
                      <Button
                        key={room.value}
                        variant="outline"
                        className="h-20 flex flex-col items-center justify-center"
                        onClick={() => handleRefer(room.value)}
                      >
                        <ArrowRight className="w-6 h-6 mb-2" />
                        {room.label}
                      </Button>
                    ))}
                  </div>

                  <div className="mt-6">
                    <Button onClick={handleComplete} className="w-full" variant="default">
                      <ClipboardList className="w-4 h-4 mr-2" />
                      Complete Visit
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
